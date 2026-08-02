import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../_lib/http";
import { supabaseAdmin } from "../_lib/supabase";
import { requireRole } from "../_lib/auth";
import { normalize, similarity, SKILL_MERGE_THRESHOLD } from "../_lib/text";
import { translateSkill } from "../_lib/translate";

// Add skills for a provider. Deterministic merge to existing skills; genuinely-new skills
// are translated by an LLM (en<->ml + emoji) and created so EVERY skill becomes usable
// across the app (Browse, Request, matching). No LLM influences a match — only labels a node.
// Ported from convex/skills.ts's resolveExisting + createSkillNode + assignProviderSkills +
// addSkills — Convex split these into internalQuery/internalMutation/action because it needed
// ctx.runQuery/ctx.runMutation boundaries; a single Vercel function has no such boundary, so
// they're inlined as plain async functions below.

const Body = z.object({ token: z.string().min(1), phrases: z.array(z.string()) });

type SkillRow = { id: string; canonical_name: string; canonical_name_ml: string | null; icon_key: string };
type AliasRow = { skill_id: string; alias_text: string };

type ResolveExisting =
  | {
      status: "resolved";
      skillId: string;
      canonicalName: string;
      canonicalNameMl: string | null;
      matchedVia: "exact" | "alias" | "similarity";
    }
  | { status: "new" };

async function resolveExisting(phrase: string): Promise<ResolveExisting> {
  const norm = normalize(phrase);

  const { data: skills, error: skillsErr } = await supabaseAdmin
    .from("skills")
    .select("id, canonical_name, canonical_name_ml, icon_key")
    .limit(500);
  if (skillsErr) throw new HttpError(500, skillsErr.message);
  const skillRows = (skills ?? []) as SkillRow[];

  for (const s of skillRows) {
    if (normalize(s.canonical_name) === norm || normalize(s.canonical_name_ml ?? "") === norm) {
      return {
        status: "resolved",
        skillId: s.id,
        canonicalName: s.canonical_name,
        canonicalNameMl: s.canonical_name_ml ?? null,
        matchedVia: "exact",
      };
    }
  }

  const { data: aliasHit, error: aliasErr } = await supabaseAdmin
    .from("skill_aliases")
    .select("skill_id, skills(id, canonical_name, canonical_name_ml)")
    .eq("alias_text", norm)
    .maybeSingle();
  if (aliasErr) throw new HttpError(500, aliasErr.message);
  if (aliasHit) {
    const sk = aliasHit.skills as unknown as { id: string; canonical_name: string; canonical_name_ml: string | null } | null;
    if (sk) {
      return {
        status: "resolved",
        skillId: sk.id,
        canonicalName: sk.canonical_name,
        canonicalNameMl: sk.canonical_name_ml ?? null,
        matchedVia: "alias",
      };
    }
  }

  const { data: allAliases, error: allAliasErr } = await supabaseAdmin
    .from("skill_aliases")
    .select("skill_id, alias_text")
    .limit(2000);
  if (allAliasErr) throw new HttpError(500, allAliasErr.message);
  const aliasRows = (allAliases ?? []) as AliasRow[];

  let best: { skill: SkillRow; score: number } | null = null;
  for (const s of skillRows) {
    let score = Math.max(similarity(norm, s.canonical_name), s.canonical_name_ml ? similarity(norm, s.canonical_name_ml) : 0);
    for (const a of aliasRows) if (a.skill_id === s.id) score = Math.max(score, similarity(norm, a.alias_text));
    if (!best || score > best.score) best = { skill: s, score };
  }
  if (best && best.score >= SKILL_MERGE_THRESHOLD) {
    return {
      status: "resolved",
      skillId: best.skill.id,
      canonicalName: best.skill.canonical_name,
      canonicalNameMl: best.skill.canonical_name_ml ?? null,
      matchedVia: "similarity",
    };
  }
  return { status: "new" };
}

// Create a new canonical skill (from an LLM translation) + an alias for the raw phrase.
// Guards against a race by returning an existing skill with the same canonical name.
async function createSkillNode(
  canonicalName: string,
  canonicalNameMl: string,
  iconKey: string,
  aliasText: string,
): Promise<{ skillId: string; canonicalName: string; canonicalNameMl: string }> {
  const { data: existing, error: existErr } = await supabaseAdmin
    .from("skills")
    .select("id, canonical_name, canonical_name_ml")
    .eq("canonical_name", canonicalName)
    .maybeSingle();
  if (existErr) throw new HttpError(500, existErr.message);
  if (existing) {
    return {
      skillId: existing.id,
      canonicalName: existing.canonical_name,
      canonicalNameMl: existing.canonical_name_ml ?? canonicalNameMl,
    };
  }
  const { data: created, error: insErr } = await supabaseAdmin
    .from("skills")
    .insert({ canonical_name: canonicalName, canonical_name_ml: canonicalNameMl, icon_key: iconKey })
    .select("id")
    .single();
  if (insErr) throw new HttpError(500, insErr.message);
  const { error: aliasInsErr } = await supabaseAdmin
    .from("skill_aliases")
    .insert({ skill_id: created.id, alias_text: normalize(aliasText), source: "approved" });
  if (aliasInsErr) throw new HttpError(500, aliasInsErr.message);
  return { skillId: created.id, canonicalName, canonicalNameMl };
}

async function assignProviderSkills(providerId: string, skillIds: string[]): Promise<void> {
  const keep = new Set(skillIds);
  const { data: existing, error: existErr } = await supabaseAdmin
    .from("provider_skills")
    .select("id, skill_id")
    .eq("provider_id", providerId);
  if (existErr) throw new HttpError(500, existErr.message);
  const toDelete: string[] = [];
  for (const ps of existing ?? []) {
    if (keep.has(ps.skill_id)) keep.delete(ps.skill_id);
    else toDelete.push(ps.id);
  }
  if (toDelete.length > 0) {
    const { error: delErr } = await supabaseAdmin.from("provider_skills").delete().in("id", toDelete);
    if (delErr) throw new HttpError(500, delErr.message);
  }
  if (keep.size > 0) {
    const rows = [...keep].map((skillId) => ({ provider_id: providerId, skill_id: skillId, proficiency: 3 }));
    const { error: insErr } = await supabaseAdmin.from("provider_skills").insert(rows);
    if (insErr) throw new HttpError(500, insErr.message);
  }
}

type Readback = {
  raw: string;
  skillId: string | null;
  canonicalName: string | null;
  canonicalNameMl: string | null;
  matchedVia: "exact" | "alias" | "similarity" | "created";
};

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, phrases } = Body.parse(req.body);
  const s = await requireRole(token, "provider");

  const readback: Readback[] = [];
  const skillIds: string[] = [];

  for (const phrase of phrases) {
    if (!phrase.trim()) continue;
    const r = await resolveExisting(phrase);
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
      const created = await createSkillNode(t.en, t.ml, t.emoji, phrase);
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
  await assignProviderSkills(s.userId, unique);
  res.status(200).json({ readback });
});
