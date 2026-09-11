import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";
import { resolveOrCreateSkill } from "../../_lib/skillResolve.js";

// Add skills for a provider. Deterministic merge to existing skills; genuinely-new skills
// are translated by an LLM (en<->ml) and created so EVERY skill becomes usable
// across the app (Browse, Request, matching). No LLM influences a match — only labels a node.
// The resolve/create half lives in _lib/skillResolve.ts, shared with
// skills/find-or-create.ts (a customer naming a skill on a request needs the same
// canonicalization, without this route's provider-only side effect below).
const Body = z.object({ token: z.string().min(1), phrases: z.array(z.string()) });

type Readback = {
  raw: string;
  skillId: string | null;
  canonicalName: string | null;
  canonicalNameMl: string | null;
  matchedVia: "exact" | "alias" | "typo" | "created";
};

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

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, phrases } = Body.parse(req.body);
  const s = await requireRole(token, "provider");

  const readback: Readback[] = [];
  const skillIds: string[] = [];

  for (const phrase of phrases) {
    if (!phrase.trim()) continue;
    const r = await resolveOrCreateSkill(phrase);
    skillIds.push(r.skillId);
    readback.push({ raw: phrase, skillId: r.skillId, canonicalName: r.canonicalName, canonicalNameMl: r.canonicalNameMl, matchedVia: r.matchedVia });
  }

  // dedupe while preserving order
  const seen = new Set<string>();
  const unique = skillIds.filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  await assignProviderSkills(s.userId, unique);
  res.status(200).json({ readback });
});
