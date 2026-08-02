import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http";
import { supabaseAdmin } from "../../_lib/supabase";
import { requireRole } from "../../_lib/auth";

const Body = z.object({ token: z.string().min(1), teamId: z.string().min(1) });

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, teamId } = Body.parse(req.body);
  await requireRole(token, "customer");

  const { data: team, error: teamErr } = await supabaseAdmin.from("teams").select("id, request_id").eq("id", teamId).maybeSingle();
  if (teamErr) throw new HttpError(500, teamErr.message);
  if (!team) throw new HttpError(404, "Team not found");

  const { error: teamUpdErr } = await supabaseAdmin.from("teams").update({ status: "confirmed" }).eq("id", teamId);
  if (teamUpdErr) throw new HttpError(500, teamUpdErr.message);
  const { error: reqUpdErr } = await supabaseAdmin.from("requests").update({ status: "assigned" }).eq("id", team.request_id);
  if (reqUpdErr) throw new HttpError(500, reqUpdErr.message);

  res.status(200).json(null);
});
