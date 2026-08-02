import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../_lib/http";
import { supabaseAdmin } from "../_lib/supabase";
import { sessionByToken } from "../_lib/auth";
import { distanceKm } from "../_lib/geo";
import { score, skillFit } from "../_lib/scoring";

// Individual "Find work" feed for a provider. Read-only + deterministic: same data -> same
// ranking. Audit rows + narration are written when the provider opens a match (narration.ts).
// Ported from convex/matching.ts's `individualFeed`.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const s = token ? await sessionByToken(token) : null;
  if (!s || s.role !== "provider") {
    res.status(200).json([]);
    return;
  }

  const { data: provider, error: provErr } = await supabaseAdmin
    .from("providers")
    .select("id, home_location_id")
    .eq("id", s.userId)
    .maybeSingle();
  if (provErr) throw new HttpError(500, provErr.message);
  if (!provider) {
    res.status(200).json([]);
    return;
  }

  const { data: mySkillRows, error: skillErr } = await supabaseAdmin
    .from("provider_skills")
    .select("skill_id, proficiency")
    .eq("provider_id", provider.id);
  if (skillErr) throw new HttpError(500, skillErr.message);
  const profBySkill = new Map<string, number>();
  for (const r of mySkillRows ?? []) profBySkill.set(r.skill_id, r.proficiency);
  if (profBySkill.size === 0) {
    res.status(200).json([]);
    return;
  }

  const { data: reqSkillRows, error: rsErr } = await supabaseAdmin
    .from("request_skills")
    .select("request_id")
    .in("skill_id", [...profBySkill.keys()]);
  if (rsErr) throw new HttpError(500, rsErr.message);
  const requestIds = [...new Set((reqSkillRows ?? []).map((r) => r.request_id))];
  if (requestIds.length === 0) {
    res.status(200).json([]);
    return;
  }

  const { data: requests, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, title, mode, units, pay, status, location_id")
    .in("id", requestIds);
  if (reqErr) throw new HttpError(500, reqErr.message);

  const cards = [];
  for (const r of requests ?? []) {
    if (r.status !== "open") continue;
    const { data: reqSkills, error: rs2Err } = await supabaseAdmin
      .from("request_skills")
      .select("skill_id")
      .eq("request_id", r.id)
      .order("created_at", { ascending: true });
    if (rs2Err) throw new HttpError(500, rs2Err.message);

    let bestProf = 0;
    let matchedSkillId: string | null = null;
    for (const rs of reqSkills ?? []) {
      const prof = profBySkill.get(rs.skill_id);
      if (prof !== undefined && prof > bestProf) {
        bestProf = prof;
        matchedSkillId = rs.skill_id;
      }
    }
    if (matchedSkillId === null) continue;

    const dist = await distanceKm(provider.home_location_id, r.location_id);
    const sc = score(skillFit(bestProf), dist, r.pay ?? undefined);
    const { data: matchedSkill, error: mErr } = await supabaseAdmin
      .from("skills")
      .select("canonical_name, canonical_name_ml")
      .eq("id", matchedSkillId)
      .maybeSingle();
    if (mErr) throw new HttpError(500, mErr.message);

    cards.push({
      requestId: r.id,
      title: r.title,
      mode: r.mode,
      units: r.units,
      pay: r.pay ?? null,
      distanceKm: dist,
      matchedSkill: matchedSkill?.canonical_name ?? "",
      matchedSkillMl: matchedSkill?.canonical_name_ml ?? null,
      total: sc.total,
    });
  }

  cards.sort((a, b) => (b.total !== a.total ? b.total - a.total : a.requestId < b.requestId ? -1 : 1));
  res.status(200).json(cards.slice(0, 20));
});
