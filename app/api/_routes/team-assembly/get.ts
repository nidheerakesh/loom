import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";

// Ported from convex/teamAssembly.ts's `getTeam`.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const teamId = typeof req.query.teamId === "string" ? req.query.teamId : undefined;
  if (!teamId) throw new HttpError(400, "teamId required");

  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id, status, rationale, complete, request_id")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr) throw new HttpError(500, teamErr.message);
  if (!team) {
    res.status(200).json(null);
    return;
  }

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select(
      "title, units, status, coordinator_role, coordinator_provider_id, agreed_rate, agreed_rate_unit, coordinator_signed_off_at, coordinator_response, coordinator_appointed_at, providers(name, shop_name)",
    )
    .eq("id", team.request_id)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  const coordinatorProvider = request?.providers as unknown as
    | { name: string; shop_name: string | null }
    | null;

  // Embedded joins pull the provider, their SHG and the assigned skill in one query,
  // instead of three (sometimes four) per member.
  const { data: memberRows, error: memErr } = await supabaseAdmin
    .from("team_members")
    .select(
      "provider_id, assigned_skill_id, covered_units, state, seq, providers(name, shop_name, groups(name)), skills(canonical_name, canonical_name_ml)",
    )
    .eq("team_id", teamId)
    .order("seq", { ascending: true });
  if (memErr) throw new HttpError(500, memErr.message);

  type MemberRow = {
    provider_id: string;
    assigned_skill_id: string;
    covered_units: number;
    state: string;
    providers: { name: string; shop_name: string | null; groups: { name: string } | null } | null;
    skills: { canonical_name: string; canonical_name_ml: string | null } | null;
  };

  // What the order asks for, skill by skill, with how much of each the team currently covers.
  // Members alone cannot answer this: a skill whose only member was removed disappears from the
  // team entirely, and that is exactly the skill somebody needs to be added for.
  const { data: reqSkillRows, error: rsErr } = await supabaseAdmin
    .from("request_skills")
    .select("skill_id, quantity, skills(canonical_name, canonical_name_ml)")
    .eq("request_id", team.request_id)
    .order("created_at", { ascending: true });
  if (rsErr) throw new HttpError(500, rsErr.message);

  const members = ((memberRows ?? []) as unknown as MemberRow[]).map((m) => ({
    providerId: m.provider_id,
    // Needed by the swap UI to look up alternatives for this specific slot.
    skillId: m.assigned_skill_id,
    name: m.providers?.name ?? "",
    shopName: m.providers?.shop_name ?? null,
    group: m.providers?.groups?.name ?? null,
    skill: m.skills?.canonical_name ?? "",
    skillMl: m.skills?.canonical_name_ml ?? null,
    coveredUnits: m.covered_units,
    state: m.state,
  }));

  type ReqSkillRow = {
    skill_id: string;
    quantity: number;
    skills: { canonical_name: string; canonical_name_ml: string | null } | null;
  };
  // A declined member is not working on this, so her units do not count as covered — the same
  // rule recomputeCoverage applies, and it must match or the two disagree on the same screen.
  const skills = ((reqSkillRows ?? []) as unknown as ReqSkillRow[]).map((r) => {
    const covered = members
      .filter((m) => m.skillId === r.skill_id && m.state !== "declined")
      .reduce((n, m) => n + m.coveredUnits, 0);
    return {
      skillId: r.skill_id,
      skill: r.skills?.canonical_name ?? "",
      skillMl: r.skills?.canonical_name_ml ?? null,
      quantity: r.quantity,
      covered,
      shortfall: Math.max(0, r.quantity - covered),
    };
  });

  res.status(200).json({
    _id: team.id,
    status: team.status,
    rationale: team.rationale,
    complete: team.complete,
    requestId: team.request_id,
    requestTitle: request?.title ?? "",
    requestUnits: request?.units ?? 0,
    requestStatus: request?.status ?? null,
    coordinatorRole: request?.coordinator_role ?? "customer",
    coordinatorProviderId: request?.coordinator_provider_id ?? null,
    coordinatorName: coordinatorProvider?.shop_name ?? coordinatorProvider?.name ?? null,
    agreedRate: request?.agreed_rate ?? null,
    agreedRateUnit: request?.agreed_rate_unit ?? null,
    coordinatorSignedOffAt: request?.coordinator_signed_off_at ?? null,
    coordinatorResponse: request?.coordinator_response ?? "accepted",
    coordinatorAppointedAt: request?.coordinator_appointed_at ?? null,
    skills,
    members,
  });
});
