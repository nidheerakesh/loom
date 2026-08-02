import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { sessionByToken } from "../../_lib/auth.js";

// Ported from convex/customers.ts's `myRequests`.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const s = token ? await sessionByToken(token) : null;
  if (!s || s.role !== "customer") {
    res.status(200).json([]);
    return;
  }

  let query = supabaseAdmin
    .from("requests")
    .select("id, title, mode, units, status")
    .eq("customer_id", s.userId)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data: requests, error } = await query;
  if (error) throw new HttpError(500, error.message);

  const out = [];
  for (const r of requests ?? []) {
    const { data: interests, error: intErr } = await supabaseAdmin
      .from("interests")
      .select("state")
      .eq("request_id", r.id);
    if (intErr) throw new HttpError(500, intErr.message);
    const { data: team, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("request_id", r.id)
      .maybeSingle();
    if (teamErr) throw new HttpError(500, teamErr.message);

    out.push({
      _id: r.id,
      title: r.title,
      mode: r.mode,
      units: r.units,
      status: r.status,
      interestedCount: (interests ?? []).filter((i) => i.state === "interested").length,
      acceptedCount: (interests ?? []).filter((i) => i.state === "accepted").length,
      teamId: team?.id ?? null,
    });
  }
  res.status(200).json(out);
});
