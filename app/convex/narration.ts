import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireRole } from "./lib/session";
import { distanceKm } from "./lib/geo";
import { score, skillFit } from "./lib/scoring";

// Mock grounded narrator. Deterministic Malayalam template built ONLY from the match record
// (the graph decides; the "LLM" narrates). Real deployments swap in Gemini + a groundedness
// validator behind this same shape. Also writes the immutable-ish match audit row first.
export const getForMatch = mutation({
  args: { token: v.string(), requestId: v.id("requests") },
  handler: async (ctx, { token, requestId }) => {
    const s = await requireRole(ctx, token, "provider");
    const providerId = s.userId as Id<"providers">;
    const provider = await ctx.db.get("providers", providerId);
    const request = await ctx.db.get("requests", requestId);
    if (!provider || !request) throw new Error("Not found");

    const mySkillRows = await ctx.db
      .query("providerSkills")
      .withIndex("by_provider", (q) => q.eq("providerId", providerId))
      .collect();
    const profBySkill = new Map<string, number>();
    for (const r of mySkillRows) profBySkill.set(r.skillId, r.proficiency);

    const reqSkills = await ctx.db
      .query("requestSkills")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .collect();
    let bestProf = 0;
    let matchedSkillId: Id<"skills"> | null = null;
    for (const rs of reqSkills) {
      const prof = profBySkill.get(rs.skillId);
      if (prof !== undefined && prof > bestProf) {
        bestProf = prof;
        matchedSkillId = rs.skillId;
      }
    }
    const dist = await distanceKm(ctx, provider.homeLocationId, request.locationId);
    const sc = score(skillFit(bestProf), dist, request.pay ?? undefined);
    const skill = matchedSkillId ? await ctx.db.get("skills", matchedSkillId) : null;
    const skillName = skill?.canonicalNameMl ?? skill?.canonicalName ?? "";

    const path: string[][] = [];
    if (skill) {
      path.push([`Provider:${provider.name}`, "HAS_SKILL", `Skill:${skill.canonicalName}`]);
      path.push([`Skill:${skill.canonicalName}`, "MATCHES", `Request:${request.title}`]);
    }

    // upsert audit match row
    const existing = await ctx.db
      .query("matches")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .filter((q) => q.eq(q.field("providerId"), providerId))
      .first();
    let matchId: Id<"matches">;
    const matchDoc = {
      type: "individual" as const,
      providerId,
      requestId,
      score: { skillFit: sc.skillFit, proximity: sc.proximity, pay: sc.pay },
      path,
    };
    if (existing) {
      await ctx.db.replace("matches", existing._id, matchDoc);
      matchId = existing._id;
    } else {
      matchId = await ctx.db.insert("matches", matchDoc);
    }

    // deterministic Malayalam narration over the record's facts
    const payPart = request.pay ? ` · ₹${request.pay}` : "";
    const text = `${provider.name}, ${dist} കി.മീ അകലെ "${request.title}" — ${skillName} ജോലി${payPart}. നിങ്ങൾക്ക് അനുയോജ്യം.`;

    const priorNarration = await ctx.db
      .query("narrations")
      .withIndex("by_match", (q) => q.eq("matchId", matchId))
      .first();
    if (priorNarration) await ctx.db.delete("narrations", priorNarration._id);
    await ctx.db.insert("narrations", { matchId, lang: "ml", text, grounded: true });

    return { text, path, score: sc };
  },
});
