import { serviceClient, getUser, json, cors, skillFit, proximity, normalizedPay } from "../_shared/util.ts";

// Mock grounded narrator: deterministic Malayalam over the match record. Upserts the audit
// match + narration. (Graph decides; narrator only restates.)
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await getUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { requestId } = await req.json();
  const db = serviceClient();

  const { data: provider } = await db.from("providers").select("id,name,home_location_id").eq("user_id", user.id).maybeSingle();
  const { data: request } = await db.from("requests").select("id,title,pay,location_id").eq("id", requestId).maybeSingle();
  if (!provider || !request) return json({ error: "not found" }, 404);

  const { data: myskills } = await db.from("provider_skills").select("skill_id,proficiency").eq("provider_id", provider.id);
  const prof = new Map<string, number>();
  for (const r of myskills ?? []) prof.set(r.skill_id, r.proficiency);
  const { data: reqSkills } = await db.from("request_skills").select("skill_id,skills(canonical_name,canonical_name_ml)").eq("request_id", requestId);
  let bestProf = 0, matched: any = null;
  for (const rs of reqSkills ?? []) { const p = prof.get(rs.skill_id); if (p != null && p > bestProf) { bestProf = p; matched = rs.skills; } }

  let dist = 0;
  if (provider.home_location_id && provider.home_location_id !== request.location_id) {
    const { data: nd } = await db.from("near_distances").select("distance_km").eq("from_location_id", provider.home_location_id).eq("to_location_id", request.location_id).maybeSingle();
    dist = nd?.distance_km ?? 0;
  }
  const score = { skillFit: skillFit(bestProf), proximity: proximity(dist), pay: normalizedPay(request.pay) };
  const skillName = matched?.canonical_name_ml ?? matched?.canonical_name ?? "";
  const path = matched
    ? [[`Provider:${provider.name}`, "HAS_SKILL", `Skill:${matched.canonical_name}`], [`Skill:${matched.canonical_name}`, "MATCHES", `Request:${request.title}`]]
    : [];

  const { data: existing } = await db.from("matches").select("id").eq("request_id", requestId).eq("provider_id", provider.id).maybeSingle();
  let matchId: string;
  if (existing) {
    await db.from("matches").update({ type: "individual", score, path }).eq("id", existing.id);
    matchId = existing.id;
  } else {
    const { data: m } = await db.from("matches").insert({ type: "individual", provider_id: provider.id, request_id: requestId, score, path }).select("id").single();
    matchId = m!.id;
  }
  const payPart = request.pay ? ` · ₹${request.pay}` : "";
  const text = `${provider.name}, ${dist} കി.മീ അകലെ "${request.title}" — ${skillName} ജോലി${payPart}. നിങ്ങൾക്ക് അനുയോജ്യം.`;
  await db.from("narrations").delete().eq("match_id", matchId);
  await db.from("narrations").insert({ match_id: matchId, lang: "ml", text, grounded: true });

  return json({ text, path, score });
});
