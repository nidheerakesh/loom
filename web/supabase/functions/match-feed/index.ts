import { serviceClient, getUser, json, cors, skillFit, proximity, normalizedPay, WEIGHTS } from "../_shared/util.ts";

// Individual "find work" feed for a provider. Deterministic ranking.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await getUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const db = serviceClient();

  const { data: provider } = await db.from("providers").select("id,home_location_id").eq("user_id", user.id).maybeSingle();
  if (!provider) return json([]);
  const { data: myskills } = await db.from("provider_skills").select("skill_id,proficiency").eq("provider_id", provider.id);
  const prof = new Map<string, number>();
  for (const r of myskills ?? []) prof.set(r.skill_id, r.proficiency);
  if (prof.size === 0) return json([]);

  const distMap = new Map<string, number>();
  if (provider.home_location_id) {
    const { data: nd } = await db.from("near_distances").select("to_location_id,distance_km").eq("from_location_id", provider.home_location_id);
    for (const r of nd ?? []) distMap.set(r.to_location_id, r.distance_km);
  }

  const { data: reqSkills } = await db.from("request_skills").select("request_id,skill_id").in("skill_id", [...prof.keys()]);
  const reqIds = [...new Set((reqSkills ?? []).map((r) => r.request_id))];
  if (reqIds.length === 0) return json([]);
  const { data: requests } = await db.from("requests").select("id,title,mode,units,pay,location_id,status").in("id", reqIds).eq("status", "open");
  const { data: allReqSkills } = await db.from("request_skills").select("request_id,skill_id,skills(canonical_name,canonical_name_ml)").in("request_id", reqIds);

  const cards = [];
  for (const r of requests ?? []) {
    let bestProf = 0, matched: any = null;
    for (const rs of allReqSkills ?? []) {
      if (rs.request_id !== r.id) continue;
      const p = prof.get(rs.skill_id);
      if (p != null && p > bestProf) { bestProf = p; matched = rs.skills; }
    }
    if (!matched) continue;
    const dist = provider.home_location_id === r.location_id ? 0 : distMap.get(r.location_id) ?? Infinity;
    const total = WEIGHTS.skill * skillFit(bestProf) + WEIGHTS.dist * proximity(dist) + WEIGHTS.earn * normalizedPay(r.pay);
    cards.push({ requestId: r.id, title: r.title, mode: r.mode, units: r.units, pay: r.pay, distanceKm: isFinite(dist) ? dist : null, matchedSkill: matched.canonical_name, matchedSkillMl: matched.canonical_name_ml, total });
  }
  cards.sort((a, b) => (b.total !== a.total ? b.total - a.total : a.requestId < b.requestId ? -1 : 1));
  return json(cards.slice(0, 20));
});
