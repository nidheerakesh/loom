import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http";
import { supabaseAdmin } from "../../_lib/supabase";
import { requireRole } from "../../_lib/auth";

const Body = z.object({ token: z.string().min(1), teamId: z.string().min(1), accept: z.boolean() });

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, teamId, accept } = Body.parse(req.body);
  const s = await requireRole(token, "provider");

  const { error } = await supabaseAdmin
    .from("team_members")
    .update({ state: accept ? "accepted" : "declined" })
    .eq("team_id", teamId)
    .eq("provider_id", s.userId);
  if (error) throw new HttpError(500, error.message);

  res.status(200).json(null);
});
