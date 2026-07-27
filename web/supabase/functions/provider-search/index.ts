import { serviceClient, getUser, json, cors, skillFit } from "../_shared/util.ts";

// Customer directory search: filter-then-rank, deterministic.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await getUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { skillId, maxDistanceKm, minExperience, maxRate } = await req.json().catch(() => ({}));
  const db = serviceClient();

  const { data: customer } = await db.from("customers").select("location_id").eq("user_id", user.id).maybeSingle();
  const fromLoc = customer?.location_id ?? null;

  const distMap = new Map<string, number>();
  if (fromLoc) {
    const { data: nd } = await db.from("near_distances").select("to_location_id,distance_km").eq("from_location_id", fromLoc);
    for (const r of nd ?? []) distMap.set(r.to_location_id, r.distance_km);
  }

  const { data: providers } = await db
    .from("providers")
    .select("id,name,shop_name,capacity,rate,rate_unit,delivery_days,experience_years,rating,rating_count,languages,available,home_location_id,provider_skills(proficiency,skill_id,skills(id,canonical_name,canonical_name_ml,icon_key))");

  const cards = [];
  for (const p of providers ?? []) {
    if (!p.available) continue;
    const pskills = (p.provider_skills ?? []) as any[];
    if (skillId && !pskills.some((ps) => ps.skill_id === skillId)) continue;
    if (minExperience != null && p.experience_years < minExperience) continue;
    if (maxRate != null && (p.rate == null || p.rate > maxRate)) continue;
    const dist = fromLoc ? (p.home_location_id === fromLoc ? 0 : distMap.get(p.home_location_id) ?? null) : null;
    if (maxDistanceKm != null && dist != null && dist > maxDistanceKm) continue;
    const matchedProf = skillId ? (pskills.find((ps) => ps.skill_id === skillId)?.proficiency ?? 0) : 0;
    cards.push({
      _id: p.id, name: p.name, shopName: p.shop_name, capacity: p.capacity,
      rate: p.rate, rateUnit: p.rate_unit, deliveryDays: p.delivery_days,
      experienceYears: p.experience_years, rating: p.rating, ratingCount: p.rating_count,
      languages: p.languages, distanceKm: dist, matchedProficiency: matchedProf,
      skills: pskills.map((ps) => ({ _id: ps.skills.id, canonicalName: ps.skills.canonical_name, canonicalNameMl: ps.skills.canonical_name_ml, iconKey: ps.skills.icon_key })),
    });
  }

  cards.sort((a, b) => {
    const ra = skillFit(a.matchedProficiency) + (a.distanceKm != null ? 1 / (1 + a.distanceKm) : 0) + a.rating / 5;
    const rb = skillFit(b.matchedProficiency) + (b.distanceKm != null ? 1 / (1 + b.distanceKm) : 0) + b.rating / 5;
    return rb !== ra ? rb - ra : a._id < b._id ? -1 : 1;
  });
  return json(cards);
});
