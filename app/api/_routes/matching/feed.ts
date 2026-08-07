import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { sessionByToken } from "../../_lib/auth.js";
import { distanceMap } from "../../_lib/geo.js";
import { score, skillFit } from "../../_lib/scoring.js";

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

  // `status` filtered in SQL rather than skipped in JS after fetching every candidate.
  const { data: requests, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, title, mode, units, pay, status, location_id")
    .in("id", requestIds)
    .eq("status", "open");
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!requests || requests.length === 0) {
    res.status(200).json([]);
    return;
  }

  // Everything the loop used to fetch per request, in three queries total.
  const [allReqSkillsRes, skillsRes, distances] = await Promise.all([
    supabaseAdmin
      .from("request_skills")
      .select("request_id, skill_id")
      .in(
        "request_id",
        requests.map((r) => r.id),
      )
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("skills")
      .select("id, canonical_name, canonical_name_ml")
      .in("id", [...profBySkill.keys()]),
    distanceMap(
      provider.home_location_id,
      requests.map((r) => r.location_id),
    ),
  ]);
  if (allReqSkillsRes.error) throw new HttpError(500, allReqSkillsRes.error.message);
  if (skillsRes.error) throw new HttpError(500, skillsRes.error.message);

  const skillsByRequest = new Map<string, string[]>();
  for (const rs of allReqSkillsRes.data ?? []) {
    const list = skillsByRequest.get(rs.request_id) ?? [];
    list.push(rs.skill_id);
    skillsByRequest.set(rs.request_id, list);
  }
  const skillById = new Map(
    (skillsRes.data ?? []).map((s) => [s.id, s] as const),
  );

  const cards = [];
  for (const r of requests) {
    let bestProf = 0;
    let matchedSkillId: string | null = null;
    for (const skillId of skillsByRequest.get(r.id) ?? []) {
      const prof = profBySkill.get(skillId);
      if (prof !== undefined && prof > bestProf) {
        bestProf = prof;
        matchedSkillId = skillId;
      }
    }
    if (matchedSkillId === null) continue;

    const dist = distances.get(r.location_id) ?? Number.POSITIVE_INFINITY;
    const sc = score(skillFit(bestProf), dist, r.pay ?? undefined);
    const matchedSkill = skillById.get(matchedSkillId);

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
