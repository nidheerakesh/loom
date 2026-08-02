// snake_case Postgres rows -> camelCase API shapes, matching the field names the
// frontend already used under Convex (minimizes changes as each screen is ported).
// Shared across auth/me, providers/*, customers/* handlers.

export type ProviderRow = {
  id: string;
  name: string;
  shop_name: string | null;
  available: boolean;
  capacity: number;
  rate: number | null;
  rate_unit: string | null;
  delivery_days: number | null;
  experience_years: number;
  rating: number;
  rating_count: number;
  languages: string[];
  home_location_id: string;
  group_id: string | null;
};

export type Provider = {
  id: string;
  name: string;
  shopName: string | null;
  available: boolean;
  capacity: number;
  rate: number | null;
  rateUnit: string | null;
  deliveryDays: number | null;
  experienceYears: number;
  rating: number;
  ratingCount: number;
  languages: string[];
  homeLocationId: string;
  groupId: string | null;
};

// phone_hash is intentionally dropped — no reason to ship it to the client.
export function mapProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    name: row.name,
    shopName: row.shop_name,
    available: row.available,
    capacity: row.capacity,
    rate: row.rate,
    rateUnit: row.rate_unit,
    deliveryDays: row.delivery_days,
    experienceYears: row.experience_years,
    rating: row.rating,
    ratingCount: row.rating_count,
    languages: row.languages,
    homeLocationId: row.home_location_id,
    groupId: row.group_id,
  };
}

export type CustomerRow = {
  id: string;
  name: string;
  company: string | null;
  location_id: string;
};

export type Customer = {
  id: string;
  name: string;
  company: string | null;
  locationId: string;
};

export function mapCustomer(row: CustomerRow): Customer {
  return { id: row.id, name: row.name, company: row.company, locationId: row.location_id };
}
