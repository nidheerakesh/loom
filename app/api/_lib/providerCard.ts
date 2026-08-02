import { supabaseAdmin } from "./supabase";
import { HttpError } from "./http";
import { distanceKm } from "./geo";

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
  skills: { _id: string; canonicalName: string; canonicalNameMl: string | null; iconKey: string }[];
  matchedProficiency: number;
};

export async function hydrateCard(
  provider: ProviderRow,
  fromLocationId: string | null,
  matchedSkillId?: string,
): Promise<ProviderCard> {
  const { data: skillRows, error } = await supabaseAdmin
    .from("provider_skills")
    .select("skill_id, proficiency, skills(id, canonical_name, canonical_name_ml, icon_key)")
    .eq("provider_id", provider.id);
  if (error) throw new HttpError(500, error.message);

  const skills: ProviderCard["skills"] = [];
  let matchedProficiency = 0;
  for (const row of skillRows ?? []) {
    const sk = row.skills as unknown as {
      id: string;
      canonical_name: string;
      canonical_name_ml: string | null;
      icon_key: string;
    } | null;
    if (sk) {
      skills.push({
        _id: sk.id,
        canonicalName: sk.canonical_name,
        canonicalNameMl: sk.canonical_name_ml ?? null,
        iconKey: sk.icon_key,
      });
      if (matchedSkillId && row.skill_id === matchedSkillId) matchedProficiency = row.proficiency;
    }
  }

  const dist = fromLocationId ? await distanceKm(fromLocationId, provider.home_location_id) : null;

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
    distanceKm: dist,
    skills,
    matchedProficiency,
  };
}
