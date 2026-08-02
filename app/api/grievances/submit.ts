import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../_lib/http";
import { supabaseAdmin } from "../_lib/supabase";
import { requireSession } from "../_lib/auth";

const Body = z.object({ token: z.string().min(1), subject: z.string(), body: z.string() });

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, subject, body } = Body.parse(req.body);
  const s = await requireSession(token);

  const { error } = await supabaseAdmin
    .from("grievances")
    .insert({ reporter_id: s.userId, reporter_role: s.role, subject, body, status: "open" });
  if (error) throw new HttpError(500, error.message);

  res.status(200).json(null);
});
