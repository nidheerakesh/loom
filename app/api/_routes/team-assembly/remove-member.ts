import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";
import { recomputeCoverage } from "../../_lib/teamCoverage.js";

const Body = z.object({
  token: z.string().min(1),
  teamId: z.string().min(1),
  providerId: z.string().min(1),
});

// Take somebody off a team without putting anybody in her place.
//
// swap-member already existed and covers replacement, but it insists on a replacement — so a
// customer who simply wanted a smaller team, or who could see no suitable alternative, had no
// move at all except to reassemble and lose every edit she had made.
//
// The permission rule is swap-member's, for the same reason. While the team is a draft nothing
// has been promised to anyone, so any member may go. Once it is confirmed, only a provider who
// declined can be removed: her slot is already empty, whereas removing a woman who accepted
// would cancel work she has agreed to do and been told is hers.
//
// Coverage is recomputed afterwards, so the team stops claiming to cover units that left with
// her — the honest-reporting property is the whole point of the engine and it must survive
// editing.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, teamId, providerId } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id, request_id, status")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr) throw new HttpError(500, teamErr.message);
  if (!team) throw new HttpError(404, "Team not found");

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("customer_id")
    .eq("id", team.request_id)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request || request.customer_id !== s.userId) throw new HttpError(403, "Not your request");

  const { data: member, error: memErr } = await supabaseAdmin
    .from("team_members")
    .select("id, state")
    .eq("team_id", teamId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (memErr) throw new HttpError(500, memErr.message);
  if (!member) throw new HttpError(404, "She is not on this team");

  if (team.status !== "proposed" && member.state !== "declined") {
    throw new HttpError(409, "This team is confirmed — only a provider who declined can be removed");
  }

  const { error: delErr } = await supabaseAdmin.from("team_members").delete().eq("id", member.id);
  if (delErr) throw new HttpError(500, delErr.message);

  const { complete, rationale } = await recomputeCoverage(teamId);
  res.status(200).json({ complete, rationale });
});
