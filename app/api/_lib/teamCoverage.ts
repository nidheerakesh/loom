import { supabaseAdmin } from "./supabase.js";
import { HttpError } from "./http.js";

// Recompute what a team covers, after its membership has been edited.
//
// `teams.complete` and `teams.rationale` are written once by assemble.ts and then read
// everywhere — the customer's screen, the report's audit trail, the sentence a provider is
// shown. Editing membership without recomputing them leaves a team that says "Coverage
// complete" while missing units, which is the one thing the engine promises never to do.
//
// The rationale is rebuilt in the same shape and the same order assemble.ts uses, so a team
// that has been edited is indistinguishable from one that was assembled that way. Ordering
// follows the request's own skill order rather than whatever Postgres returned, which is what
// keeps the string deterministic.
export async function recomputeCoverage(teamId: string): Promise<{ complete: boolean; rationale: string }> {
  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id, request_id")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr) throw new HttpError(500, teamErr.message);
  if (!team) throw new HttpError(404, "Team not found");

  const [reqSkillsRes, membersRes] = await Promise.all([
    supabaseAdmin
      .from("request_skills")
      .select("skill_id, quantity")
      .eq("request_id", team.request_id)
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("team_members")
      .select("provider_id, assigned_skill_id, covered_units, state, providers(group_id)")
      .eq("team_id", teamId),
  ]);
  if (reqSkillsRes.error) throw new HttpError(500, reqSkillsRes.error.message);
  if (membersRes.error) throw new HttpError(500, membersRes.error.message);

  const required = reqSkillsRes.data ?? [];
  type MemberRow = {
    provider_id: string;
    assigned_skill_id: string;
    covered_units: number;
    state: string;
    providers: { group_id: string | null } | null;
  };
  const members = (membersRes.data ?? []) as unknown as MemberRow[];

  // A provider who declined is not on this job, so her units do not count towards covering it.
  // Without this a team could report itself complete on the strength of a refusal.
  const active = members.filter((m) => m.state !== "declined");

  const coveredBySkill = new Map<string, number>();
  for (const m of active) {
    coveredBySkill.set(
      m.assigned_skill_id,
      (coveredBySkill.get(m.assigned_skill_id) ?? 0) + m.covered_units,
    );
  }
  const complete = required.every((r) => (coveredBySkill.get(r.skill_id) ?? 0) >= r.quantity);

  const { data: skillRows, error: skErr } = await supabaseAdmin
    .from("skills")
    .select("id, canonical_name")
    .in("id", required.map((r) => r.skill_id));
  if (skErr) throw new HttpError(500, skErr.message);
  const nameById = new Map((skillRows ?? []).map((s) => [s.id, s.canonical_name] as const));
  const skillNames = required
    .map((r) => nameById.get(r.skill_id))
    .filter((n): n is string => !!n);

  const providerIds = new Set(active.map((m) => m.provider_id));
  const groupIds = new Set(
    active.map((m) => m.providers?.group_id).filter((g): g is string => !!g),
  );

  const rationale =
    `${providerIds.size} providers across ${groupIds.size} group(s) cover ${skillNames.join(", ")}.` +
    (complete ? " Coverage complete." : " Coverage INCOMPLETE.");

  const { error: upErr } = await supabaseAdmin
    .from("teams")
    .update({ complete, rationale })
    .eq("id", teamId);
  if (upErr) throw new HttpError(500, upErr.message);

  return { complete, rationale };
}

// How many units of a skill this team still needs — the ceiling on what a new member can be
// given, so adding somebody can never over-assign the order.
export async function shortfallFor(teamId: string, skillId: string): Promise<number> {
  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("request_id")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr) throw new HttpError(500, teamErr.message);
  if (!team) throw new HttpError(404, "Team not found");

  const [reqRes, memRes] = await Promise.all([
    supabaseAdmin
      .from("request_skills")
      .select("quantity")
      .eq("request_id", team.request_id)
      .eq("skill_id", skillId)
      .maybeSingle(),
    supabaseAdmin
      .from("team_members")
      .select("covered_units, state")
      .eq("team_id", teamId)
      .eq("assigned_skill_id", skillId),
  ]);
  if (reqRes.error) throw new HttpError(500, reqRes.error.message);
  if (memRes.error) throw new HttpError(500, memRes.error.message);

  if (!reqRes.data) throw new HttpError(400, "This order does not need that skill");
  const covered = (memRes.data ?? [])
    .filter((m) => m.state !== "declined")
    .reduce((n, m) => n + m.covered_units, 0);
  return Math.max(0, reqRes.data.quantity - covered);
}
