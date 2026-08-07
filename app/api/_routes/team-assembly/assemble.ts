import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";
import { distanceMap } from "../../_lib/geo.js";

const Body = z.object({ token: z.string().min(1), requestId: z.string().min(1) });

// Collective matching (TDD §6.2). Greedy, capacity-aware set-cover over the cluster.
// Deterministic: candidates sorted by (proficiency desc, distance asc, seq asc) — no
// randomness, so the same request always yields the same team. Ported from
// convex/teamAssembly.ts's `assemble`. Tiebreak uses providers.seq (creation-ordered,
// added specifically for this) instead of Convex's creation-ordered `_id` — Postgres
// uuids are random and can't stand in for that.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, location_id, customer_id")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request) throw new HttpError(404, "Request not found");
  if (request.customer_id !== s.userId) throw new HttpError(403, "Not your request");

  const { data: reqSkills, error: rsErr } = await supabaseAdmin
    .from("request_skills")
    .select("skill_id, quantity")
    .eq("request_id", requestId);
  if (rsErr) throw new HttpError(500, rsErr.message);
  const skills = reqSkills ?? [];
  const remaining = new Map<string, number>();
  for (const rs of skills) remaining.set(rs.skill_id, rs.quantity);

  type Cand = {
    provider: { id: string; seq: number; group_id: string | null };
    distance: number;
    capLeft: number;
    prof: Map<string, number>;
  };
  const candMap = new Map<string, Cand>();

  // Candidates for every required skill at once. This was a nested loop issuing one
  // provider_skills query per skill and then a providers query plus a distance lookup per
  // candidate — the assembly step alone could run to hundreds of round trips.
  const skillIds = skills.map((rs) => rs.skill_id);
  const { data: psRows, error: psErr } = await supabaseAdmin
    .from("provider_skills")
    .select("provider_id, skill_id, proficiency")
    .in("skill_id", skillIds);
  if (psErr) throw new HttpError(500, psErr.message);

  const candidateIds = [...new Set((psRows ?? []).map((r) => r.provider_id))];
  if (candidateIds.length > 0) {
    const { data: provRows, error: pErr } = await supabaseAdmin
      .from("providers")
      .select("id, seq, capacity, available, home_location_id, group_id")
      .in("id", candidateIds)
      .eq("available", true);
    if (pErr) throw new HttpError(500, pErr.message);

    const distances = await distanceMap(
      request.location_id,
      (provRows ?? []).map((p) => p.home_location_id),
    );

    for (const p of provRows ?? []) {
      candMap.set(p.id, {
        provider: { id: p.id, seq: p.seq, group_id: p.group_id },
        distance: distances.get(p.home_location_id) ?? Number.POSITIVE_INFINITY,
        capLeft: p.capacity,
        prof: new Map(),
      });
    }
    for (const row of psRows ?? []) {
      candMap.get(row.provider_id)?.prof.set(row.skill_id, row.proficiency);
    }
  }

  // assignments: providerId -> skillId -> units
  const assignments = new Map<string, Map<string, number>>();
  let progress = true;
  while (progress) {
    progress = false;
    for (const rs of skills) {
      const need = remaining.get(rs.skill_id) ?? 0;
      if (need <= 0) continue;
      const eligible = [...candMap.values()].filter((c) => c.capLeft > 0 && c.prof.has(rs.skill_id));
      if (eligible.length === 0) continue;
      eligible.sort((a, b) => {
        const pa = a.prof.get(rs.skill_id)!;
        const pb = b.prof.get(rs.skill_id)!;
        if (pb !== pa) return pb - pa;
        if (a.distance !== b.distance) return a.distance - b.distance;
        return a.provider.seq - b.provider.seq;
      });
      const pick = eligible[0];
      const take = Math.min(need, pick.capLeft);
      pick.capLeft -= take;
      remaining.set(rs.skill_id, need - take);
      const pid = pick.provider.id;
      if (!assignments.has(pid)) assignments.set(pid, new Map());
      const m = assignments.get(pid)!;
      m.set(rs.skill_id, (m.get(rs.skill_id) ?? 0) + take);
      progress = true;
    }
  }

  const complete = [...remaining.values()].every((x) => x <= 0);

  const chosenProviderIds = [...assignments.keys()];
  const groupIds = new Set<string>();
  for (const pid of chosenProviderIds) {
    const c = candMap.get(pid);
    if (c?.provider.group_id) groupIds.add(c.provider.group_id);
  }
  const { data: skillRows, error: skErr } = await supabaseAdmin
    .from("skills")
    .select("id, canonical_name")
    .in("id", skillIds);
  if (skErr) throw new HttpError(500, skErr.message);
  const nameById = new Map((skillRows ?? []).map((s) => [s.id, s.canonical_name] as const));
  // Ordered by the request's own skill order, not the order Postgres returned them, so the
  // rationale string stays deterministic.
  const skillNames = skills
    .map((rs) => nameById.get(rs.skill_id))
    .filter((n): n is string => !!n);
  const rationale = `${chosenProviderIds.length} providers across ${groupIds.size} group(s) cover ${skillNames.join(", ")}.${complete ? " Coverage complete." : " Coverage INCOMPLETE."}`;

  // clear any prior team for this request (idempotent re-assembly)
  const { data: priorTeams, error: ptErr } = await supabaseAdmin.from("teams").select("id").eq("request_id", requestId);
  if (ptErr) throw new HttpError(500, ptErr.message);
  const priorTeamIds = (priorTeams ?? []).map((t) => t.id);
  if (priorTeamIds.length > 0) {
    const { error: delMemErr } = await supabaseAdmin.from("team_members").delete().in("team_id", priorTeamIds);
    if (delMemErr) throw new HttpError(500, delMemErr.message);
    const { error: delTeamErr } = await supabaseAdmin.from("teams").delete().in("id", priorTeamIds);
    if (delTeamErr) throw new HttpError(500, delTeamErr.message);
  }

  const { data: team, error: teamInsErr } = await supabaseAdmin
    .from("teams")
    .insert({ request_id: requestId, status: "proposed", rationale, complete })
    .select("id")
    .single();
  if (teamInsErr) throw new HttpError(500, teamInsErr.message);

  const memberRows: { team_id: string; provider_id: string; assigned_skill_id: string; covered_units: number; state: string }[] = [];
  for (const [pid, skillMap] of assignments) {
    for (const [skillId, units] of skillMap) {
      memberRows.push({ team_id: team.id, provider_id: pid, assigned_skill_id: skillId, covered_units: units, state: "invited" });
    }
  }
  if (memberRows.length > 0) {
    const { error: memErr } = await supabaseAdmin.from("team_members").insert(memberRows);
    if (memErr) throw new HttpError(500, memErr.message);
  }
  const { error: statusErr } = await supabaseAdmin.from("requests").update({ status: "assembling" }).eq("id", requestId);
  if (statusErr) throw new HttpError(500, statusErr.message);

  res.status(200).json({ teamId: team.id, complete });
});
