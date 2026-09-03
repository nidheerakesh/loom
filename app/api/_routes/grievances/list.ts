import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

// Every grievance, for whoever is moderating them.
//
// Grievances have been collected since the beginning and read by nobody: `grievances/mine`
// returns only your own, so a complaint went into the database and stopped. A reporting channel
// that cannot be read is worse than none, because it tells a woman someone is listening.
//
// Reporter names are resolved here rather than stored on the row. `reporter_id` is polymorphic
// text — a provider id or a customer id, mirroring how `sessions` works — so there is no join
// to write and two lookups are the honest cost of that shape.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  await requireRole(token ?? "", "admin");

  const status = typeof req.query.status === "string" ? req.query.status : undefined;

  let q = supabaseAdmin
    .from("grievances")
    .select("id, reporter_id, reporter_role, subject, body, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) throw new HttpError(500, error.message);
  const rows = data ?? [];

  const providerIds = rows.filter((g) => g.reporter_role === "provider").map((g) => g.reporter_id);
  const customerIds = rows.filter((g) => g.reporter_role === "customer").map((g) => g.reporter_id);

  const [provRes, custRes] = await Promise.all([
    providerIds.length
      ? supabaseAdmin.from("providers").select("id, name").in("id", providerIds)
      : Promise.resolve({ data: [], error: null }),
    customerIds.length
      ? supabaseAdmin.from("customers").select("id, name").in("id", customerIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (provRes.error) throw new HttpError(500, provRes.error.message);
  if (custRes.error) throw new HttpError(500, custRes.error.message);

  const nameById = new Map<string, string>();
  for (const p of provRes.data ?? []) nameById.set(p.id, p.name);
  for (const c of custRes.data ?? []) nameById.set(c.id, c.name);

  res.status(200).json(
    rows.map((g) => ({
      _id: g.id,
      subject: g.subject,
      body: g.body,
      status: g.status,
      reporterRole: g.reporter_role,
      reporterName: nameById.get(g.reporter_id) ?? "—",
      createdAt: g.created_at,
    })),
  );
});
