import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";
import { distanceMap } from "../../_lib/geo.js";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const requestId = typeof req.query.requestId === "string" ? req.query.requestId : undefined;
  if (!requestId) throw new HttpError(400, "requestId required");
  await requireRole(token, "customer");

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("location_id")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);

  const { data: interests, error } = await supabaseAdmin
    .from("interests")
    .select("state, providers(id, name, shop_name, rating, rate, rate_unit, home_location_id)")
    .eq("request_id", requestId);
  if (error) throw new HttpError(500, error.message);

  type ProviderRow = {
    id: string;
    name: string;
    shop_name: string | null;
    rating: number;
    rate: number | null;
    rate_unit: string | null;
    home_location_id: string;
  };
  const rows = (interests ?? [])
    .map((i) => ({ state: i.state, p: i.providers as unknown as ProviderRow | null }))
    .filter((r): r is { state: string; p: ProviderRow } => r.p !== null);

  // Distance from each applicant to the job itself — the same pairing MyWork.tsx shows a
  // provider, just from the other side, so she can sort applicants by who's actually nearby
  // rather than reading raw distances off a directory search she'd have to cross-reference.
  const distances = request?.location_id
    ? await distanceMap(request.location_id, rows.map((r) => r.p.home_location_id))
    : new Map<string, number>();

  res.status(200).json(
    rows.map(({ state, p }) => ({
      providerId: p.id,
      name: p.name,
      shopName: p.shop_name ?? null,
      rating: p.rating,
      // Her own asking rate — shown so the customer can compare applicants before
      // deciding, not enforced anywhere: the eventual agreed rate is a separate number
      // she and the coordinator settle on after discussion.
      rate: p.rate ?? null,
      rateUnit: p.rate_unit ?? null,
      distanceKm: distances.get(p.home_location_id) ?? null,
      state,
    })),
  );
});
