import { QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Distance within the cluster. Prefer the precomputed nearDistances edge; fall back to a
// deterministic haversine over stored lat/lng so any pair resolves.
export async function distanceKm(
  ctx: QueryCtx,
  fromId: Id<"locations">,
  toId: Id<"locations">,
): Promise<number> {
  if (fromId === toId) return 0;
  const edge = await ctx.db
    .query("nearDistances")
    .withIndex("by_from", (q) => q.eq("fromLocationId", fromId))
    .filter((q) => q.eq(q.field("toLocationId"), toId))
    .first();
  if (edge) return edge.distanceKm;

  const a = await ctx.db.get("locations", fromId);
  const b = await ctx.db.get("locations", toId);
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
