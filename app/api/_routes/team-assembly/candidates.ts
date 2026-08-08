import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";
import { distanceMap } from "../../_lib/geo.js";

// Alternatives for one slot on a proposed team: other available providers who hold the same
// skill, ranked the way assembly ranks them, excluding whoever is already on the team.
//
// Assembly picks the top candidate per slot and offers no say in it. USER_FLOWS §5 specifies
// a swap step so the customer can override — they may know the person, or know something the
// ranking cannot see.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const teamId = typeof req.query.teamId === "string" ? req.query.teamId : undefined;
  const skillId = typeof req.query.skillId === "string" ? req.query.skillId : undefined;
  if (!teamId || !skillId) throw new HttpError(400, "teamId and skillId required");
  const s = await requireRole(token, "customer");

  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id, request_id")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr) throw new HttpError(500, teamErr.message);
  if (!team) throw new HttpError(404, "Team not found");

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("customer_id, location_id")
    .eq("id", team.request_id)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request || request.customer_id !== s.userId) throw new HttpError(403, "Not your request");

  const [skillRes, memberRes] = await Promise.all([
    supabaseAdmin.from("provider_skills").select("provider_id, proficiency").eq("skill_id", skillId),
    supabaseAdmin.from("team_members").select("provider_id").eq("team_id", teamId),
  ]);
  if (skillRes.error) throw new HttpError(500, skillRes.error.message);
  if (memberRes.error) throw new HttpError(500, memberRes.error.message);

  const onTeam = new Set((memberRes.data ?? []).map((m) => m.provider_id));
  const profById = new Map<string, number>();
  for (const r of skillRes.data ?? []) profById.set(r.provider_id, r.proficiency);
  const candidateIds = [...profById.keys()].filter((id) => !onTeam.has(id));
  if (candidateIds.length === 0) {
    res.status(200).json([]);
    return;
  }

  const { data: providers, error: provErr } = await supabaseAdmin
    .from("providers")
    .select("id, seq, name, shop_name, capacity, rating, group_id, home_location_id")
    .in("id", candidateIds)
    .eq("available", true);
  if (provErr) throw new HttpError(500, provErr.message);
  if (!providers || providers.length === 0) {
    res.status(200).json([]);
    return;
  }

  const distances = await distanceMap(
    request.location_id,
    providers.map((p) => p.home_location_id),
  );

  const out = providers
    .map((p) => ({
      providerId: p.id,
      name: p.name,
      shopName: p.shop_name ?? null,
      capacity: p.capacity,
      rating: p.rating,
      proficiency: profById.get(p.id) ?? 0,
      distanceKm: distances.get(p.home_location_id) ?? null,
      seq: p.seq,
    }))
    // Same ordering assembly uses, so the list reads as "who it would have picked next".
    .sort((a, b) => {
      if (b.proficiency !== a.proficiency) return b.proficiency - a.proficiency;
      const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
      if (da !== db) return da - db;
      return a.seq - b.seq;
    })
    .slice(0, 10)
    .map(({ seq: _seq, ...c }) => c);

  res.status(200).json(out);
});
