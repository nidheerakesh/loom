import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler } from "../../_lib/http";
import { supabaseAdmin } from "../../_lib/supabase";

const Body = z.object({ token: z.string().min(1) });

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token } = Body.parse(req.body);
  await supabaseAdmin.from("sessions").delete().eq("token", token);
  res.status(200).json(null);
});
