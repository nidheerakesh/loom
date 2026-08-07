import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { sessionByToken } from "../../_lib/auth.js";
import { distanceMap } from "../../_lib/geo.js";

// Individual work this provider has accepted.
//
// The mirror image of my-incoming.ts, which lists requests the provider has NOT responded to
// and only while they are still open. Accepting flips `interests.state` to 'accepted' and the
// request to 'assigned', which every other provider-facing query filters out — so before this
// endpoint existed a job simply vanished the moment it was accepted, with nowhere to see it.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const s = token ? await sessionByToken(token) : null;
  if (!s || s.role !== "provider") {
    res.status(200).json([]);
    return;
  }

  const { data: provider, error: provErr } = await supabaseAdmin
    .from("providers")
    .select("id, home_location_id")
    .eq("id", s.userId)
    .maybeSingle();
  if (provErr) throw new HttpError(500, provErr.message);
  if (!provider) {
    res.status(200).json([]);
    return;
  }

  const { data: accepted, error: intErr } = await supabaseAdmin
    .from("interests")
    .select("request_id")
    .eq("provider_id", provider.id)
    .eq("state", "accepted");
  if (intErr) throw new HttpError(500, intErr.message);

  const requestIds = [...new Set((accepted ?? []).map((i) => i.request_id))];
  if (requestIds.length === 0) {
    res.status(200).json([]);
    return;
  }

  // No status filter: accepted work is worth showing through 'assigned' and 'completed'
  // alike, which is the whole point of the screen.
  const { data: requests, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, title, units, pay, status, mode, location_id, created_at, customers(name)")
    .in("id", requestIds)
    .order("created_at", { ascending: false });
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!requests || requests.length === 0) {
    res.status(200).json([]);
    return;
  }

  type Row = {
    id: string;
    title: string;
    units: number;
    pay: number | null;
    status: string;
    mode: string;
    location_id: string;
    customers: { name: string } | null;
  };
  const rows = requests as unknown as Row[];

  const distances = await distanceMap(
    provider.home_location_id,
    rows.map((r) => r.location_id),
  );

  res.status(200).json(
    rows.map((r) => ({
      _id: r.id,
      title: r.title,
      units: r.units,
      pay: r.pay ?? null,
      status: r.status,
      mode: r.mode,
      customerName: r.customers?.name ?? null,
      distanceKm: distances.get(r.location_id) ?? null,
    })),
  );
});
