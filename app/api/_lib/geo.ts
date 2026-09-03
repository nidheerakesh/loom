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

// How far from a known area a captured point can be and still be called that area.
const SNAP_KM = 3;
// ~1.1km at this latitude. Coordinates are rounded to this before anything is stored.
const GRID_DP = 2;

// Turn a captured GPS reading into a location row, without ever storing where she actually is.
//
// A provider's distance to work is shown to customers. If we stored her exact coordinates, a
// handful of queries from different points would triangulate her house — in a product built for
// her safety. So a reading is never persisted as given:
//
//   1. If it falls within SNAP_KM of an area we already know, she *is* at that area. Nothing new
//      is written and she shares a row with her neighbours, which is also what the seeded data
//      does. Her position within the area is unrecoverable because it was never recorded.
//   2. Otherwise the reading is rounded to a ~1km grid and stored as a new area. Still not her
//      house, and the label says so.
//
// Matching is unaffected: SNAP_KM is well inside the distances the score cares about, and
// `proximity` is 1/(1+km), which is deliberately smooth rather than banded.
export async function resolveLocationId(lat: number, lng: number): Promise<string> {
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpError(400, "Invalid coordinates");
  }

  const { data: known, error } = await supabaseAdmin
    .from("locations")
    .select("id, lat, lng")
    .limit(500);
  if (error) throw new HttpError(500, error.message);

  let nearest: { id: string; km: number } | null = null;
  for (const l of known ?? []) {
    const km = haversine(lat, lng, l.lat, l.lng);
    if (!nearest || km < nearest.km) nearest = { id: l.id, km };
  }
  if (nearest && nearest.km <= SNAP_KM) return nearest.id;

  const gLat = Number(lat.toFixed(GRID_DP));
  const gLng = Number(lng.toFixed(GRID_DP));

  // Two people in the same new cell must land on the same row rather than racing to create two.
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("locations")
    .select("id")
    .eq("lat", gLat)
    .eq("lng", gLng)
    .maybeSingle();
  if (exErr) throw new HttpError(500, exErr.message);
  if (existing) return existing.id;

  const { data: created, error: insErr } = await supabaseAdmin
    .from("locations")
    .insert({ lat: gLat, lng: gLng, label: `${gLat.toFixed(2)}, ${gLng.toFixed(2)}` })
    .select("id")
    .single();
  if (insErr) throw new HttpError(500, insErr.message);
  return created.id;
}
