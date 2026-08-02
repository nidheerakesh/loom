import { supabaseAdmin } from "./supabase";
import { HttpError } from "./http";

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
