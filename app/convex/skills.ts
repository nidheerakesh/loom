import { action, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { requireRole, sessionByToken } from "./lib/session";
import { normalize, similarity, SKILL_MERGE_THRESHOLD } from "./lib/text";
import { translateSkill } from "./lib/translate";

export const listSkills = query({
  args: {},
  handler: async (ctx) => {
    const skills = await ctx.db.query("skills").take(500);
    return skills.map((s) => ({
      _id: s._id,
      canonicalName: s.canonicalName,
      canonicalNameMl: s.canonicalNameMl ?? null,
      iconKey: s.iconKey,
    }));
  },
});

export const myProviderSkills = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await sessionByToken(ctx, token);
    if (!s || s.role !== "provider") return [];
    const ps = await ctx.db
      .query("providerSkills")
      .withIndex("by_provider", (q) => q.eq("providerId", s.userId as Id<"providers">))
      .collect();
    const out = [];
    for (const row of ps) {
      const skill = await ctx.db.get("skills", row.skillId);
      if (skill)
        out.push({
          _id: skill._id,
          canonicalName: skill.canonicalName,
          canonicalNameMl: skill.canonicalNameMl ?? null,
          iconKey: skill.iconKey,
          proficiency: row.proficiency,
        });
    }
    return out;
  },
});

type ResolveExisting =
  | {
      status: "resolved";
      skillId: Id<"skills">;
      canonicalName: string;
      canonicalNameMl: string | null;
      matchedVia: "exact" | "alias" | "similarity";
      similarity: number;
    }
  | { status: "new"; norm: string; similarity: number };

// Deterministic, READ-ONLY resolution against the existing catalogue.
// exact → alias → similarity ≥ threshold. If nothing matches, it's "new" (the action then
// translates + creates it). No writes here, no LLM here.
export const resolveExisting = internalQuery({
  args: { phrase: v.string() },
  handler: async (ctx, { phrase }): Promise<ResolveExisting> => {
    const norm = normalize(phrase);
    const skills = await ctx.db.query("skills").take(500);

    for (const s of skills) {
      if (normalize(s.canonicalName) === norm || normalize(s.canonicalNameMl ?? "") === norm) {
        return {
          status: "resolved",
          skillId: s._id,
          canonicalName: s.canonicalName,
          canonicalNameMl: s.canonicalNameMl ?? null,
          matchedVia: "exact",
          similarity: 1,
        };
      }
    }

    const alias = await ctx.db
      .query("skillAliases")
      .withIndex("by_alias", (q) => q.eq("aliasText", norm))
      .first();
    if (alias) {
      const s = await ctx.db.get("skills", alias.skillId);
      if (s)
        return {
          status: "resolved",
          skillId: s._id,
          canonicalName: s.canonicalName,
          canonicalNameMl: s.canonicalNameMl ?? null,
          matchedVia: "alias",
          similarity: 1,
        };
    }

    const allAliases = await ctx.db.query("skillAliases").take(2000);
    let best: { id: Id<"skills">; name: string; ml: string | null; score: number } | null = null;
    for (const s of skills) {
      let score = Math.max(
        similarity(norm, s.canonicalName),
        s.canonicalNameMl ? similarity(norm, s.canonicalNameMl) : 0,
      );
      for (const a of allAliases) if (a.skillId === s._id) score = Math.max(score, similarity(norm, a.aliasText));
      if (!best || score > best.score) best = { id: s._id, name: s.canonicalName, ml: s.canonicalNameMl ?? null, score };
    }
    if (best && best.score >= SKILL_MERGE_THRESHOLD) {
      return {
        status: "resolved",
        skillId: best.id,
        canonicalName: best.name,
        canonicalNameMl: best.ml,
        matchedVia: "similarity",
        similarity: best.score,
      };
    }
    return { status: "new", norm, similarity: best?.score ?? 0 };
  },
});

// Create a new canonical skill (from an LLM translation) + an alias for the raw phrase.
// Guards against a race by returning an existing skill with the same canonical name.
export const createSkillNode = internalMutation({
  args: {
    canonicalName: v.string(),
    canonicalNameMl: v.string(),
    iconKey: v.string(),
    aliasText: v.string(),
  },
  handler: async (ctx, args): Promise<{ skillId: Id<"skills">; canonicalName: string; canonicalNameMl: string }> => {
    const existing = await ctx.db
      .query("skills")
      .withIndex("by_name", (q) => q.eq("canonicalName", args.canonicalName))
      .first();
    if (existing) {
      return { skillId: existing._id, canonicalName: existing.canonicalName, canonicalNameMl: existing.canonicalNameMl ?? args.canonicalNameMl };
    }
    const skillId = await ctx.db.insert("skills", {
      canonicalName: args.canonicalName,
      canonicalNameMl: args.canonicalNameMl,
      iconKey: args.iconKey,
    });
    await ctx.db.insert("skillAliases", { skillId, aliasText: normalize(args.aliasText), source: "approved" });
    return { skillId, canonicalName: args.canonicalName, canonicalNameMl: args.canonicalNameMl };
  },
});

export const assignProviderSkills = internalMutation({
  args: { token: v.string(), skillIds: v.array(v.id("skills")) },
  handler: async (ctx, { token, skillIds }) => {
    const s = await requireRole(ctx, token, "provider");
    const providerId = s.userId as Id<"providers">;
    const keep = new Set(skillIds);
    const existing = await ctx.db
      .query("providerSkills")
      .withIndex("by_provider", (q) => q.eq("providerId", providerId))
      .collect();
    for (const ps of existing) {
      if (keep.has(ps.skillId)) keep.delete(ps.skillId);
      else await ctx.db.delete("providerSkills", ps._id);
    }
    for (const skillId of keep) {
      await ctx.db.insert("providerSkills", { providerId, skillId, proficiency: 3 });
    }
    return null;
  },
});

type Readback = {
  raw: string;
  skillId: Id<"skills"> | null;
  canonicalName: string | null;
  canonicalNameMl: string | null;
  matchedVia: "exact" | "alias" | "similarity" | "created";
};

// Add skills for a provider. Deterministic merge to existing skills; genuinely-new skills
// are translated by an LLM (en↔ml + emoji) and created so EVERY skill becomes usable
// across the app (Browse, Request, matching). No LLM influences a match — only labels a node.
export const addSkills = action({
  args: { token: v.string(), phrases: v.array(v.string()) },
  handler: async (ctx, { token, phrases }): Promise<{ readback: Readback[] }> => {
    const readback: Readback[] = [];
    const skillIds: Id<"skills">[] = [];

    for (const phrase of phrases) {
      if (!phrase.trim()) continue;
      const r = await ctx.runQuery(internal.skills.resolveExisting, { phrase });
      if (r.status === "resolved") {
        skillIds.push(r.skillId);
        readback.push({
          raw: phrase,
          skillId: r.skillId,
          canonicalName: r.canonicalName,
          canonicalNameMl: r.canonicalNameMl,
          matchedVia: r.matchedVia,
        });
      } else {
        const t = await translateSkill(phrase); // LLM (or graceful fallback)
        const created = await ctx.runMutation(internal.skills.createSkillNode, {
          canonicalName: t.en,
          canonicalNameMl: t.ml,
          iconKey: t.emoji,
          aliasText: phrase,
        });
        skillIds.push(created.skillId);
        readback.push({
          raw: phrase,
          skillId: created.skillId,
          canonicalName: created.canonicalName,
          canonicalNameMl: created.canonicalNameMl,
          matchedVia: "created",
        });
      }
    }

    // dedupe while preserving order
    const seen = new Set<string>();
    const unique = skillIds.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
    await ctx.runMutation(internal.skills.assignProviderSkills, { token, skillIds: unique });
    return { readback };
  },
});
