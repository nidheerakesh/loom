import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../_lib/http";
import { supabaseAdmin } from "../_lib/supabase";
import { sessionByToken } from "../_lib/auth";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const s = token ? await sessionByToken(token) : null;
  if (!s || s.role !== "provider") {
    res.status(200).json([]);
    return;
  }

  const { data: rows, error } = await supabaseAdmin
    .from("team_members")
    .select("team_id, assigned_skill_id, covered_units, state")
    .eq("provider_id", s.userId);
  if (error) throw new HttpError(500, error.message);

  const out = [];
  for (const m of rows ?? []) {
    const { data: team, error: teamErr } = await supabaseAdmin.from("teams").select("id, status, request_id").eq("id", m.team_id).maybeSingle();
    if (teamErr) throw new HttpError(500, teamErr.message);
    if (!team) continue;
    const { data: request, error: reqErr } = await supabaseAdmin.from("requests").select("title").eq("id", team.request_id).maybeSingle();
    if (reqErr) throw new HttpError(500, reqErr.message);
    const { data: sk, error: skErr } = await supabaseAdmin
      .from("skills")
      .select("canonical_name, canonical_name_ml")
      .eq("id", m.assigned_skill_id)
      .maybeSingle();
    if (skErr) throw new HttpError(500, skErr.message);
    out.push({
      teamId: team.id,
      teamStatus: team.status,
      requestTitle: request?.title ?? "",
      skill: sk?.canonical_name ?? "",
      skillMl: sk?.canonical_name_ml ?? null,
      coveredUnits: m.covered_units,
      state: m.state,
    });
  }
  res.status(200).json(out);
});
