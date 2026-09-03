import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

// Move a grievance along: open → reviewing → resolved.
//
// The statuses already existed in the enum and nothing could ever change one, so every
// grievance ever filed still says "open". The reporter sees this status on her own screen, so
// this is the difference between a complaint that visibly went somewhere and one that did not.
const Body = z.object({
  token: z.string().min(1),
  grievanceId: z.string().min(1),
  status: z.enum(["open", "reviewing", "resolved"]),
});

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, grievanceId, status } = Body.parse(req.body);
  await requireRole(token, "admin");

  const { data, error } = await supabaseAdmin
    .from("grievances")
    .update({ status })
    .eq("id", grievanceId)
    .select("id")
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "No such grievance");

  res.status(200).json({ status });
});
