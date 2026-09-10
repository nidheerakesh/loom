import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { sessionByToken } from "../../_lib/auth.js";
import { distanceMap } from "../../_lib/geo.js";

// Individual work this provider has put their hand up for, in either state:
//   interested — waiting for the customer to choose between the providers who applied
//   accepted   — the customer awarded them the work
//
// The mirror image of my-incoming.ts, which lists requests the provider has NOT responded to
// and only while they are still open. Once a provider responds, the request drops out of
// every other provider-facing query, so without this endpoint the job simply vanished.
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

  // Two independent reasons a job belongs to her: she applied and either waits or won
  // (`interests`), or the customer appointed her to coordinate it — which needs no
  // application at all, per the group-coordinator feature: "someone [the customer] appoints,
  // can be a provider," not restricted to providers already on the job.
  const [mineRes, coordinatingRes] = await Promise.all([
    supabaseAdmin
      .from("interests")
      .select("request_id, state")
      .eq("provider_id", provider.id)
      .in("state", ["interested", "accepted"]),
    supabaseAdmin.from("requests").select("id").eq("coordinator_provider_id", provider.id),
  ]);
  if (mineRes.error) throw new HttpError(500, mineRes.error.message);
  if (coordinatingRes.error) throw new HttpError(500, coordinatingRes.error.message);

  const stateByRequest = new Map((mineRes.data ?? []).map((i) => [i.request_id, i.state] as const));
  const coordinatingIds = new Set((coordinatingRes.data ?? []).map((r) => r.id));
  const requestIds = [...new Set([...stateByRequest.keys(), ...coordinatingIds])];
  if (requestIds.length === 0) {
    res.status(200).json([]);
    return;
  }

  // No status filter: accepted work is worth showing through 'assigned' and 'completed'
  // alike, which is the whole point of the screen.
  const { data: requests, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select(
      "id, title, units, pay, status, mode, location_id, created_at, customers(name), coordinator_signed_off_at",
    )
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
    coordinator_signed_off_at: string | null;
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
      // 'interested' means still competing for the job; 'accepted' means it is theirs; null
      // means she never applied at all — only reachable when she is coordinating it instead.
      interestState: stateByRequest.get(r.id) ?? null,
      isCoordinator: coordinatingIds.has(r.id),
      coordinatorSignedOffAt: r.coordinator_signed_off_at ?? null,
      customerName: r.customers?.name ?? null,
      distanceKm: distances.get(r.location_id) ?? null,
    })),
  );
});
