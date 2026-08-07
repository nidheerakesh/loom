import { supabaseAdmin } from "./supabase.js";
import { HttpError } from "./http.js";
import { distanceMap } from "./geo.js";

// Ported from convex/providers.ts's hydrateCard() — was an unexported helper shared by
// providers.search and providers.getProfile, kept unexported there so duplicated in Convex;
// here it's a real shared module so both routes import the same function.

export type ProviderRow = {
  id: string;
  name: string;
  shop_name: string | null;
  capacity: number;
  rate: number | null;
  rate_unit: string | null;
  delivery_days: number | null;
  experience_years: number;
  rating: number;
  rating_count: number;
  languages: string[];
  home_location_id: string;
};

export type ProviderCard = {
  _id: string;
  name: string;
  shopName: string | null;
  capacity: number;
  rate: number | null;
  rateUnit: string | null;
  deliveryDays: number | null;
  experienceYears: number;
  rating: number;
  ratingCount: number;
  languages: string[];
  distanceKm: number | null;
  skills: { _id: string; canonicalName: string; canonicalNameMl: string | null }[];
  matchedProficiency: number;
};

type SkillJoin = { id: string; canonical_name: string; canonical_name_ml: string | null } | null;

// Hydrate many providers with a fixed number of queries (two) instead of two per provider.
// `hydrateCard` in a loop is what made directory search take ~40s over 40 providers.
export async function hydrateCards(
  providers: ProviderRow[],
  fromLocationId: string | null,
  matchedSkillId?: string,
): Promise<ProviderCard[]> {
  if (providers.length === 0) return [];

  const [skillRes, distances] = await Promise.all([
    supabaseAdmin
      .from("provider_skills")
      .select("provider_id, skill_id, proficiency, skills(id, canonical_name, canonical_name_ml)")
      .in(
        "provider_id",
        providers.map((p) => p.id),
      ),
    distanceMap(
      fromLocationId,
      providers.map((p) => p.home_location_id),
    ),
  ]);
  if (skillRes.error) throw new HttpError(500, skillRes.error.message);

  const byProvider = new Map<string, { skills: ProviderCard["skills"]; matched: number }>();
  for (const row of skillRes.data ?? []) {
    const sk = row.skills as unknown as SkillJoin;
    if (!sk) continue;
    let entry = byProvider.get(row.provider_id);
    if (!entry) {
      entry = { skills: [], matched: 0 };
      byProvider.set(row.provider_id, entry);
    }
    entry.skills.push({
      _id: sk.id,
      canonicalName: sk.canonical_name,
      canonicalNameMl: sk.canonical_name_ml ?? null,
    });
    if (matchedSkillId && row.skill_id === matchedSkillId) entry.matched = row.proficiency;
  }

  return providers.map((provider) => {
    const entry = byProvider.get(provider.id);
    return {
      _id: provider.id,
      name: provider.name,
      shopName: provider.shop_name ?? null,
      capacity: provider.capacity,
      rate: provider.rate ?? null,
      rateUnit: provider.rate_unit ?? null,
      deliveryDays: provider.delivery_days ?? null,
      experienceYears: provider.experience_years,
      rating: provider.rating,
      ratingCount: provider.rating_count,
      languages: provider.languages,
      distanceKm: fromLocationId ? (distances.get(provider.home_location_id) ?? null) : null,
      skills: entry?.skills ?? [],
      matchedProficiency: entry?.matched ?? 0,
    };
  });
}

// Single-provider convenience, for the profile route where there is exactly one.
export async function hydrateCard(
  provider: ProviderRow,
  fromLocationId: string | null,
  matchedSkillId?: string,
): Promise<ProviderCard> {
  const [card] = await hydrateCards([provider], fromLocationId, matchedSkillId);
  return card;
}
