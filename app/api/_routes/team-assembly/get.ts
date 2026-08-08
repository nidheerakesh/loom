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
    .select("title, units")
    .eq("id", team.request_id)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);

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

  res.status(200).json({
    _id: team.id,
    status: team.status,
    rationale: team.rationale,
    complete: team.complete,
    requestTitle: request?.title ?? "",
    requestUnits: request?.units ?? 0,
    members,
  });
});
