import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http";
import { supabaseAdmin } from "../../_lib/supabase";
import { sessionByToken } from "../../_lib/auth";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const s = token ? await sessionByToken(token) : null;
  if (!s) {
    res.status(200).json([]);
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("grievances")
    .select("id, subject, body, status")
    .eq("reporter_id", s.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new HttpError(500, error.message);

  res.status(200).json((data ?? []).map((g) => ({ _id: g.id, subject: g.subject, body: g.body, status: g.status })));
});
