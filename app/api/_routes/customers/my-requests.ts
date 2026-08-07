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

  if (!requests || requests.length === 0) {
    res.status(200).json([]);
    return;
  }

  // Two batched queries instead of two per request.
  const requestIds = requests.map((r) => r.id);
  const [interestsRes, teamsRes] = await Promise.all([
    supabaseAdmin.from("interests").select("request_id, state").in("request_id", requestIds),
    supabaseAdmin.from("teams").select("id, request_id").in("request_id", requestIds),
  ]);
  if (interestsRes.error) throw new HttpError(500, interestsRes.error.message);
  if (teamsRes.error) throw new HttpError(500, teamsRes.error.message);

  const counts = new Map<string, { interested: number; accepted: number }>();
  for (const i of interestsRes.data ?? []) {
    const c = counts.get(i.request_id) ?? { interested: 0, accepted: 0 };
    if (i.state === "interested") c.interested += 1;
    if (i.state === "accepted") c.accepted += 1;
    counts.set(i.request_id, c);
  }
  const teamByRequest = new Map<string, string>();
  for (const t of teamsRes.data ?? []) {
    if (!teamByRequest.has(t.request_id)) teamByRequest.set(t.request_id, t.id);
  }

  res.status(200).json(
    requests.map((r) => ({
      _id: r.id,
      title: r.title,
      mode: r.mode,
      units: r.units,
      status: r.status,
      interestedCount: counts.get(r.id)?.interested ?? 0,
      acceptedCount: counts.get(r.id)?.accepted ?? 0,
      teamId: teamByRequest.get(r.id) ?? null,
    })),
  );
});
