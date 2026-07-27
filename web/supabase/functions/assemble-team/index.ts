import { serviceClient, getUser, json, cors } from "../_shared/util.ts";

// Collective matching: greedy, capacity-aware set-cover. Deterministic.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await getUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { requestId } = await req.json();
  const db = serviceClient();

  const { data: customer } = await db.from("customers").select("id").eq("user_id", user.id).maybeSingle();
  const { data: request } = await db.from("requests").select("id,location_id,customer_id").eq("id", requestId).maybeSingle();
  if (!customer || !request || request.customer_id !== customer.id) return json({ error: "not your request" }, 403);

  const { data: reqSkills } = await db.from("request_skills").select("skill_id,quantity,skills(canonical_name)").eq("request_id", requestId);
  const remaining = new Map<string, number>();
  for (const rs of reqSkills ?? []) remaining.set(rs.skill_id, rs.quantity);

  const distMap = new Map<string, number>();
  if (request.location_id) {
    const { data: nd } = await db.from("near_distances").select("from_location_id,distance_km").eq("to_location_id", request.location_id);
    for (const r of nd ?? []) distMap.set(r.from_location_id, r.distance_km);
  }

  // candidate pool
  const skillIds = [...remaining.keys()];
  const { data: ps } = await db.from("provider_skills")
    .select("provider_id,skill_id,proficiency,providers(id,capacity,available,home_location_id,group_id)")
    .in("skill_id", skillIds);
  type Cand = { id: string; capLeft: number; distance: number; group: string | null; prof: Map<string, number> };
  const cands = new Map<string, Cand>();
  for (const row of ps ?? []) {
    const p: any = row.providers;
    if (!p || !p.available) continue;
    if (!cands.has(p.id)) {
      const d = p.home_location_id === request.location_id ? 0 : distMap.get(p.home_location_id) ?? Infinity;
      cands.set(p.id, { id: p.id, capLeft: p.capacity, distance: d, group: p.group_id, prof: new Map() });
    }
    cands.get(p.id)!.prof.set(row.skill_id, row.proficiency);
  }

  const assignments = new Map<string, Map<string, number>>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const skillId of skillIds) {
      const need = remaining.get(skillId) ?? 0;
      if (need <= 0) continue;
      const eligible = [...cands.values()].filter((c) => c.capLeft > 0 && c.prof.has(skillId));
      if (!eligible.length) continue;
      eligible.sort((a, b) => {
        const pa = a.prof.get(skillId)!, pb = b.prof.get(skillId)!;
        if (pb !== pa) return pb - pa;
        if (a.distance !== b.distance) return a.distance - b.distance;
        return a.id < b.id ? -1 : 1;
      });
      const pick = eligible[0];
      const take = Math.min(need, pick.capLeft);
      pick.capLeft -= take;
      remaining.set(skillId, need - take);
      if (!assignments.has(pick.id)) assignments.set(pick.id, new Map());
      const m = assignments.get(pick.id)!;
      m.set(skillId, (m.get(skillId) ?? 0) + take);
      progress = true;
    }
  }

  const complete = [...remaining.values()].every((x) => x <= 0);
  const groups = new Set<string>();
  for (const pid of assignments.keys()) { const g = cands.get(pid)?.group; if (g) groups.add(g); }
  const skillNames = (reqSkills ?? []).map((r: any) => r.skills.canonical_name);
  const rationale = `${assignments.size} providers across ${groups.size} group(s) cover ${skillNames.join(", ")}.${complete ? " Coverage complete." : " Coverage INCOMPLETE."}`;

  // clear prior teams
  await db.from("teams").delete().eq("request_id", requestId);
  const { data: team } = await db.from("teams").insert({ request_id: requestId, status: "proposed", rationale, complete }).select("id").single();
  for (const [pid, skillMap] of assignments) {
    for (const [skillId, units] of skillMap) {
      await db.from("team_members").insert({ team_id: team!.id, provider_id: pid, assigned_skill_id: skillId, covered_units: units, state: "invited" });
    }
  }
  await db.from("requests").update({ status: "assembling" }).eq("id", requestId);

  return json({ teamId: team!.id, complete });
});
