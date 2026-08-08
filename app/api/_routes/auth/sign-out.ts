import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";

const Body = z.object({ token: z.string().min(1) });

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token } = Body.parse(req.body);
  const { error } = await supabaseAdmin.from("sessions").delete().eq("token", token);
  // Reported rather than swallowed: a sign-out that silently fails leaves a live session
  // behind while telling the user they are signed out.
  if (error) throw new HttpError(500, error.message);
  res.status(200).json(null);
});
