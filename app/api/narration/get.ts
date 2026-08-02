import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../_lib/http";
import { supabaseAdmin } from "../_lib/supabase";
import { requireRole } from "../_lib/auth";
import { distanceKm } from "../_lib/geo";
import { score, skillFit } from "../_lib/scoring";

const Body = z.object({ token: z.string().min(1), requestId: z.string().min(1) });

// Mock grounded narrator. Deterministic Malayalam template built ONLY from the match record
// (the graph decides; the "LLM" narrates). Real deployments swap in Gemini + a groundedness
// validator behind this same shape. Also writes the immutable-ish match audit row first.
// Ported from convex/narration.ts's `getForMatch`.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId } = Body.parse(req.body);
  const s = await requireRole(token, "provider");
  const providerId = s.userId;

  const { data: provider, error: provErr } = await supabaseAdmin
    .from("providers")
    .select("name, home_location_id")
    .eq("id", providerId)
    .maybeSingle();
  if (provErr) throw new HttpError(500, provErr.message);
  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("title, pay, location_id")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!provider || !request) throw new HttpError(404, "Not found");

  const { data: mySkillRows, error: skillErr } = await supabaseAdmin
    .from("provider_skills")
    .select("skill_id, proficiency")
    .eq("provider_id", providerId);
  if (skillErr) throw new HttpError(500, skillErr.message);
  const profBySkill = new Map<string, number>();
  for (const r of mySkillRows ?? []) profBySkill.set(r.skill_id, r.proficiency);

  const { data: reqSkills, error: rsErr } = await supabaseAdmin
    .from("request_skills")
    .select("skill_id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (rsErr) throw new HttpError(500, rsErr.message);

  let bestProf = 0;
  let matchedSkillId: string | null = null;
  for (const rs of reqSkills ?? []) {
    const prof = profBySkill.get(rs.skill_id);
    if (prof !== undefined && prof > bestProf) {
      bestProf = prof;
      matchedSkillId = rs.skill_id;
    }
  }

  const dist = await distanceKm(provider.home_location_id, request.location_id);
  const sc = score(skillFit(bestProf), dist, request.pay ?? undefined);

  let skill: { canonical_name: string; canonical_name_ml: string | null } | null = null;
  if (matchedSkillId) {
    const { data, error } = await supabaseAdmin
      .from("skills")
      .select("canonical_name, canonical_name_ml")
      .eq("id", matchedSkillId)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    skill = data;
  }
  const skillName = skill?.canonical_name_ml ?? skill?.canonical_name ?? "";

  const path: string[][] = [];
  if (skill) {
    path.push([`Provider:${provider.name}`, "HAS_SKILL", `Skill:${skill.canonical_name}`]);
    path.push([`Skill:${skill.canonical_name}`, "MATCHES", `Request:${request.title}`]);
  }

  // upsert audit match row
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("matches")
    .select("id")
    .eq("request_id", requestId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (exErr) throw new HttpError(500, exErr.message);

  const matchDoc = {
    type: "individual",
    provider_id: providerId,
    request_id: requestId,
    score: { skillFit: sc.skillFit, proximity: sc.proximity, pay: sc.pay },
    path,
  };
  let matchId: string;
  if (existing) {
    const { error } = await supabaseAdmin.from("matches").update(matchDoc).eq("id", existing.id);
    if (error) throw new HttpError(500, error.message);
    matchId = existing.id;
  } else {
    const { data: created, error } = await supabaseAdmin.from("matches").insert(matchDoc).select("id").single();
    if (error) throw new HttpError(500, error.message);
    matchId = created.id;
  }

  // deterministic Malayalam narration over the record's facts
  const payPart = request.pay ? ` · ₹${request.pay}` : "";
  const text = `${provider.name}, ${dist} കി.മീ അകലെ "${request.title}" — ${skillName} ജോലി${payPart}. നിങ്ങൾക്ക് അനുയോജ്യം.`;

  const { data: priorNarration, error: pnErr } = await supabaseAdmin
    .from("narrations")
    .select("id")
    .eq("match_id", matchId)
    .maybeSingle();
  if (pnErr) throw new HttpError(500, pnErr.message);
  if (priorNarration) {
    const { error } = await supabaseAdmin.from("narrations").delete().eq("id", priorNarration.id);
    if (error) throw new HttpError(500, error.message);
  }
  const { error: insErr } = await supabaseAdmin.from("narrations").insert({ match_id: matchId, lang: "ml", text, grounded: true });
  if (insErr) throw new HttpError(500, insErr.message);

  res.status(200).json({ text, path, score: sc });
});
