import { HttpError } from "./http.js";
import { supabaseAdmin } from "./supabase.js";
import { isProbableTypo, normalize } from "./text.js";
import { translateSkill } from "./translate.js";

// The lookup half of skills/resolve.ts, split out so it can be reused by anything that needs
// "turn this phrase into a real skill row" without the provider-only side effect
// (skills/resolve.ts also overwrites the calling provider's own skill list, which makes no
// sense for a customer naming a skill she needs on a job).

type SkillRow = { id: string; canonical_name: string; canonical_name_ml: string | null };
type AliasRow = { skill_id: string; alias_text: string };

export type ResolvedSkill = {
  skillId: string;
  canonicalName: string;
  canonicalNameMl: string | null;
  matchedVia: "exact" | "alias" | "typo" | "created";
};

async function resolveExisting(phrase: string): Promise<ResolvedSkill | null> {
  const norm = normalize(phrase);

  const { data: skills, error: skillsErr } = await supabaseAdmin
    .from("skills")
    .select("id, canonical_name, canonical_name_ml")
    .limit(500);
  if (skillsErr) throw new HttpError(500, skillsErr.message);
  const skillRows = (skills ?? []) as SkillRow[];

  for (const s of skillRows) {
    if (normalize(s.canonical_name) === norm || normalize(s.canonical_name_ml ?? "") === norm) {
      return {
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
      return { skillId: sk.id, canonicalName: sk.canonical_name, canonicalNameMl: sk.canonical_name_ml ?? null, matchedVia: "alias" };
    }
  }

  const { data: allAliases, error: allAliasErr } = await supabaseAdmin
    .from("skill_aliases")
    .select("skill_id, alias_text")
    .limit(2000);
  if (allAliasErr) throw new HttpError(500, allAliasErr.message);
  const aliasRows = (allAliases ?? []) as AliasRow[];

  // Typo tier — deliberately NOT a meaning tier. It only rescues misspellings of something
  // already in the catalogue. Meaning is the alias table's job above; anything genuinely new
  // goes on to translation and becomes its own skill rather than being force-fitted to
  // whatever it happens to resemble.
  for (const s of skillRows) {
    const surfaces = [s.canonical_name, s.canonical_name_ml ?? ""].filter(Boolean);
    for (const a of aliasRows) if (a.skill_id === s.id) surfaces.push(a.alias_text);
    if (surfaces.some((surface) => isProbableTypo(norm, surface))) {
      return { skillId: s.id, canonicalName: s.canonical_name, canonicalNameMl: s.canonical_name_ml ?? null, matchedVia: "typo" };
    }
  }
  return null;
}

// Create a new canonical skill (from an LLM translation) + an alias for the raw phrase.
// Guards against a race by returning an existing skill with the same canonical name.
async function createSkillNode(canonicalName: string, canonicalNameMl: string, aliasText: string): Promise<ResolvedSkill> {
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
      matchedVia: "created",
    };
  }
  const { data: created, error: insErr } = await supabaseAdmin
    .from("skills")
    .insert({ canonical_name: canonicalName, canonical_name_ml: canonicalNameMl })
    .select("id")
    .single();
  if (insErr) throw new HttpError(500, insErr.message);
  const { error: aliasInsErr } = await supabaseAdmin
    .from("skill_aliases")
    .insert({ skill_id: created.id, alias_text: normalize(aliasText), source: "approved" });
  if (aliasInsErr) throw new HttpError(500, aliasInsErr.message);
  return { skillId: created.id, canonicalName, canonicalNameMl, matchedVia: "created" };
}

// Resolve a phrase to an existing canonical skill, or create one — never assigns it to
// anyone's profile. That's the caller's job (provider skill assignment, a request's required
// skills, etc.), and differs by who's calling.
export async function resolveOrCreateSkill(phrase: string): Promise<ResolvedSkill> {
  const existing = await resolveExisting(phrase);
  if (existing) return existing;
  const t = await translateSkill(phrase); // LLM (or graceful fallback)
  return createSkillNode(t.en, t.ml, phrase);
}
