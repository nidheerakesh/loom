import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

const Body = z.object({ token: z.string().min(1), teamId: z.string().min(1), accept: z.boolean() });

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, teamId, accept } = Body.parse(req.body);
  const s = await requireRole(token, "provider");

  // Enforced here and not only by hiding the team in my-teams: a provider must not be able to
  // commit to a team the customer has not confirmed, even by replaying a request. The team is
  // still the customer's draft until then and may be re-assembled or abandoned.
  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("status")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr) throw new HttpError(500, teamErr.message);
  if (!team) throw new HttpError(404, "Team not found");
  if (team.status !== "confirmed") throw new HttpError(409, "This team is not confirmed yet");

  const { error } = await supabaseAdmin
    .from("team_members")
    .update({ state: accept ? "accepted" : "declined" })
    .eq("team_id", teamId)
    .eq("provider_id", s.userId);
  if (error) throw new HttpError(500, error.message);

  res.status(200).json(null);
});
