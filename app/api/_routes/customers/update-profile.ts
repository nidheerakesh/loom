import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

const Body = z.object({ token: z.string().min(1), name: z.string().optional(), company: z.string().optional() });

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, name, company } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (company !== undefined) patch.company = company;
  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseAdmin.from("customers").update(patch).eq("id", s.userId);
    if (error) throw new HttpError(500, error.message);
  }
  res.status(200).json(null);
});
