import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { sessionByToken } from "../../_lib/auth.js";
import { hydrateCards, ProviderCard } from "../../_lib/providerCard.js";
import { skillFit } from "../../_lib/scoring.js";

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

  // Narrow to providers holding the requested skill. With no skill filter we query the
  // providers table directly — fetching every id only to pass them straight back in an
  // `.in()` was a wasted round trip.
  let providerIds: string[] | null = null;
  if (skillId) {
    const { data: rows, error } = await supabaseAdmin.from("provider_skills").select("provider_id").eq("skill_id", skillId);
    if (error) throw new HttpError(500, error.message);
    providerIds = [...new Set((rows ?? []).map((r) => r.provider_id))];
    if (providerIds.length === 0) {
      res.status(200).json([]);
      return;
    }
  }

  // Filters run in SQL, not in JS after the fetch — `available` in particular was never
  // applied in the query, so every unavailable provider was fetched and hydrated first.
  let q = supabaseAdmin
    .from("providers")
    .select(
      "id, seq, name, shop_name, available, capacity, rate, rate_unit, delivery_days, experience_years, rating, rating_count, languages, home_location_id",
    )
    .eq("available", true)
    .order("seq", { ascending: true })
    .limit(500);
  if (providerIds) q = q.in("id", providerIds);
  if (minExperience !== undefined) q = q.gte("experience_years", minExperience);
  if (maxRate !== undefined) q = q.not("rate", "is", null).lte("rate", maxRate);

  const { data: providers, error: provErr } = await q;
  if (provErr) throw new HttpError(500, provErr.message);

  // One batched hydration for the whole page instead of two queries per provider.
  const hydrated = await hydrateCards(providers ?? [], fromLocationId, skillId);
  const seqById = new Map((providers ?? []).map((p) => [p.id, p.seq]));

  const cards: (ProviderCard & { seq: number })[] = hydrated
    .filter(
      (card) =>
        maxDistanceKm === undefined || card.distanceKm === null || card.distanceKm <= maxDistanceKm,
    )
    .map((card) => ({ ...card, seq: seqById.get(card._id) ?? 0 }));

  // rank: skillFit + proximity; deterministic tiebreak on seq (mirrors Convex's `_id asc` —
  // Postgres uuids are random, seq is creation-ordered).
  //
  // Rating is deliberately NOT a term here. PRD §6.2 and M15 make reputation display-first
  // and keep it out of the match decision, so that a provider with no ratings yet is not
  // ranked below an established one for the same work.
  cards.sort((a, b) => {
    const ra = skillFit(a.matchedProficiency) + (a.distanceKm !== null ? 1 / (1 + a.distanceKm) : 0);
    const rb = skillFit(b.matchedProficiency) + (b.distanceKm !== null ? 1 / (1 + b.distanceKm) : 0);
    if (rb !== ra) return rb - ra;
    return a.seq - b.seq;
  });

  res.status(200).json(cards.map(({ seq: _seq, ...card }) => card));
});
