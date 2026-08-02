import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../_lib/http";
import { supabaseAdmin } from "../_lib/supabase";
import { sessionByToken } from "../_lib/auth";
import { hydrateCard, ProviderCard } from "../_lib/providerCard";
import { skillFit } from "../_lib/scoring";

function qNum(v: unknown): number | undefined {
  return typeof v === "string" && v !== "" ? Number(v) : undefined;
}

// Customer directory search (TDD §6.4): filter-then-rank, deterministic.
// Ported from convex/providers.ts's `search`.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const skillId = typeof req.query.skillId === "string" ? req.query.skillId : undefined;
  const maxDistanceKm = qNum(req.query.maxDistanceKm);
  const minExperience = qNum(req.query.minExperience);
  const maxRate = qNum(req.query.maxRate);
  if (!token) throw new HttpError(401, "Not authenticated");

  const s = await sessionByToken(token);
  let fromLocationId: string | null = null;
  if (s?.role === "customer") {
    const { data: c, error } = await supabaseAdmin.from("customers").select("location_id").eq("id", s.userId).maybeSingle();
    if (error) throw new HttpError(500, error.message);
    fromLocationId = c?.location_id ?? null;
  }

  // candidate providers by skill (or all if no skill given)
  let providerIds: string[];
  if (skillId) {
    const { data: rows, error } = await supabaseAdmin.from("provider_skills").select("provider_id").eq("skill_id", skillId);
    if (error) throw new HttpError(500, error.message);
    providerIds = [...new Set((rows ?? []).map((r) => r.provider_id))];
  } else {
    const { data: all, error } = await supabaseAdmin.from("providers").select("id").order("seq", { ascending: true }).limit(500);
    if (error) throw new HttpError(500, error.message);
    providerIds = (all ?? []).map((p) => p.id);
  }
  if (providerIds.length === 0) {
    res.status(200).json([]);
    return;
  }

  const { data: providers, error: provErr } = await supabaseAdmin
    .from("providers")
    .select(
      "id, seq, name, shop_name, available, capacity, rate, rate_unit, delivery_days, experience_years, rating, rating_count, languages, home_location_id",
    )
    .in("id", providerIds);
  if (provErr) throw new HttpError(500, provErr.message);

  const cards: (ProviderCard & { seq: number })[] = [];
  for (const p of providers ?? []) {
    if (!p.available) continue;
    if (minExperience !== undefined && p.experience_years < minExperience) continue;
    if (maxRate !== undefined) {
      if (p.rate === null || p.rate === undefined || p.rate > maxRate) continue;
    }
    const card = await hydrateCard(p, fromLocationId, skillId);
    if (maxDistanceKm !== undefined && card.distanceKm !== null && card.distanceKm > maxDistanceKm) continue;
    cards.push({ ...card, seq: p.seq });
  }

  // rank: skillFit + proximity + normalized rating; deterministic tiebreak on seq
  // (mirrors Convex's `_id asc` tiebreak — Postgres uuids are random, seq is creation-ordered).
  cards.sort((a, b) => {
    const ra = skillFit(a.matchedProficiency) + (a.distanceKm !== null ? 1 / (1 + a.distanceKm) : 0) + a.rating / 5;
    const rb = skillFit(b.matchedProficiency) + (b.distanceKm !== null ? 1 / (1 + b.distanceKm) : 0) + b.rating / 5;
    if (rb !== ra) return rb - ra;
    return a.seq - b.seq;
  });

  res.status(200).json(cards.map(({ seq: _seq, ...card }) => card));
});
