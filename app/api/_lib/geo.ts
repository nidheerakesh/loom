import { supabaseAdmin } from "./supabase.js";
import { HttpError } from "./http.js";

// Distance within the cluster. Prefer the precomputed near_distances edge; fall back to a
// deterministic haversine over stored lat/lng so any pair resolves. Ported from convex/lib/geo.ts.
export async function distanceKm(fromId: string, toId: string): Promise<number> {
  if (fromId === toId) return 0;

  const { data: edge, error: edgeErr } = await supabaseAdmin
    .from("near_distances")
    .select("distance_km")
    .eq("from_location_id", fromId)
    .eq("to_location_id", toId)
    .maybeSingle();
  if (edgeErr) throw new HttpError(500, edgeErr.message);
  if (edge) return edge.distance_km;

  const { data: locs, error: locErr } = await supabaseAdmin
    .from("locations")
    .select("id, lat, lng")
    .in("id", [fromId, toId]);
  if (locErr) throw new HttpError(500, locErr.message);
  const a = locs?.find((l) => l.id === fromId);
  const b = locs?.find((l) => l.id === toId);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return haversine(a.lat, a.lng, b.lat, b.lng);
}

// Distances from one origin to many destinations, in two queries instead of one-to-two per
// pair. `distanceKm` in a loop was the single biggest cost in the app: directory search over
// 40 providers spent ~40s almost entirely on these round trips.
export async function distanceMap(
  fromId: string | null,
  toIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!fromId || toIds.length === 0) return out;

  const targets = [...new Set(toIds)];
  out.set(fromId, 0);

  const { data: edges, error: edgeErr } = await supabaseAdmin
    .from("near_distances")
    .select("to_location_id, distance_km")
    .eq("from_location_id", fromId)
    .in("to_location_id", targets);
  if (edgeErr) throw new HttpError(500, edgeErr.message);
  for (const e of edges ?? []) out.set(e.to_location_id, e.distance_km);

  // Anything without a precomputed edge falls back to haversine over stored coordinates,
  // fetched in one go rather than per pair.
  const missing = targets.filter((id) => !out.has(id));
  if (missing.length === 0) return out;

  const { data: locs, error: locErr } = await supabaseAdmin
    .from("locations")
    .select("id, lat, lng")
    .in("id", [fromId, ...missing]);
  if (locErr) throw new HttpError(500, locErr.message);
  const origin = locs?.find((l) => l.id === fromId);
  if (!origin) return out;
  for (const id of missing) {
    const b = locs?.find((l) => l.id === id);
    out.set(id, b ? haversine(origin.lat, origin.lng, b.lat, b.lng) : Number.POSITIVE_INFINITY);
  }
  return out;
}

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}
