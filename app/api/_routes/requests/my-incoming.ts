import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { sessionByToken } from "../../_lib/auth.js";
import { distanceMap } from "../../_lib/geo.js";

// Provider "Requests" tab — open individual requests matching this provider's skills
// that they have not yet responded to. Ported from convex/requests.ts's `myIncoming`.
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
    .select("skill_id")
    .eq("provider_id", provider.id);
  if (skillErr) throw new HttpError(500, skillErr.message);
  const mySkillIds = [...new Set((mySkillRows ?? []).map((r) => r.skill_id))];
  if (mySkillIds.length === 0) {
    res.status(200).json([]);
    return;
  }

  const { data: myInterests, error: intErr } = await supabaseAdmin
    .from("interests")
    .select("request_id")
    .eq("provider_id", provider.id);
  if (intErr) throw new HttpError(500, intErr.message);
  const responded = new Set((myInterests ?? []).map((i) => i.request_id));

  const { data: reqSkillRows, error: rsErr } = await supabaseAdmin
    .from("request_skills")
    .select("request_id")
    .in("skill_id", mySkillIds);
  if (rsErr) throw new HttpError(500, rsErr.message);
  const requestIds = [...new Set((reqSkillRows ?? []).map((r) => r.request_id))].filter((id) => !responded.has(id));
  if (requestIds.length === 0) {
    res.status(200).json([]);
    return;
  }

  // status/mode filtered in SQL rather than discarded in JS after fetching.
  const { data: requests, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, title, units, pay, status, mode, location_id")
    .in("id", requestIds)
    .eq("status", "open")
    .eq("mode", "individual");
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!requests || requests.length === 0) {
    res.status(200).json([]);
    return;
  }

  // One batched distance lookup instead of one per request.
  const distances = await distanceMap(
    provider.home_location_id,
    requests.map((r) => r.location_id),
  );

  const out = requests.map((r) => ({
    _id: r.id,
    title: r.title,
    units: r.units,
    pay: r.pay ?? null,
    distanceKm: distances.get(r.location_id) ?? Number.POSITIVE_INFINITY,
  }));
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  res.status(200).json(out);
});
