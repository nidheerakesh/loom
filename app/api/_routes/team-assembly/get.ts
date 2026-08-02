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

  const { data: memberRows, error: memErr } = await supabaseAdmin
    .from("team_members")
    .select("provider_id, assigned_skill_id, covered_units, state, seq")
    .eq("team_id", teamId)
    .order("seq", { ascending: true });
  if (memErr) throw new HttpError(500, memErr.message);

  const members = [];
  for (const m of memberRows ?? []) {
    const { data: p, error: pErr } = await supabaseAdmin
      .from("providers")
      .select("name, shop_name, group_id")
      .eq("id", m.provider_id)
      .maybeSingle();
    if (pErr) throw new HttpError(500, pErr.message);
    const { data: sk, error: skErr } = await supabaseAdmin
      .from("skills")
      .select("canonical_name, canonical_name_ml")
      .eq("id", m.assigned_skill_id)
      .maybeSingle();
    if (skErr) throw new HttpError(500, skErr.message);
    let groupName: string | null = null;
    if (p?.group_id) {
      const { data: g, error: gErr } = await supabaseAdmin.from("groups").select("name").eq("id", p.group_id).maybeSingle();
      if (gErr) throw new HttpError(500, gErr.message);
      groupName = g?.name ?? null;
    }
    members.push({
      providerId: m.provider_id,
      name: p?.name ?? "",
      shopName: p?.shop_name ?? null,
      group: groupName,
      skill: sk?.canonical_name ?? "",
      skillMl: sk?.canonical_name_ml ?? null,
      coveredUnits: m.covered_units,
      state: m.state,
    });
  }

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
