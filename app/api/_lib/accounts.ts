import { HttpError } from "./http.js";
import { supabaseAdmin } from "./supabase.js";
import { fnv1a } from "./text.js";

export type AccountRole = "provider" | "customer";

// Which accounts a phone number already owns. A number may hold both — someone who stitches
// for a living can also hire a caterer — so this returns a list rather than a single role.
export async function rolesForPhone(phoneHash: string): Promise<AccountRole[]> {
  const [prov, cust] = await Promise.all([
    supabaseAdmin.from("providers").select("id").eq("phone_hash", phoneHash).maybeSingle(),
    supabaseAdmin.from("customers").select("id").eq("phone_hash", phoneHash).maybeSingle(),
  ]);
  if (prov.error) throw new HttpError(500, prov.error.message);
  if (cust.error) throw new HttpError(500, cust.error.message);

  const roles: AccountRole[] = [];
  if (prov.data) roles.push("provider");
  if (cust.data) roles.push("customer");
  return roles;
}

export async function accountId(phoneHash: string, role: AccountRole): Promise<string | null> {
  const table = role === "provider" ? "providers" : "customers";
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id")
    .eq("phone_hash", phoneHash)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data?.id ?? null;
}

// Deterministic seeded location/group so a fresh signup is matchable within the cluster.
export async function pickLocationId(phoneHash: string): Promise<string> {
  const { data: locs, error } = await supabaseAdmin.from("locations").select("id").limit(200);
  if (error) throw new HttpError(500, error.message);
  if (!locs || locs.length === 0) {
    const { data, error: insErr } = await supabaseAdmin
      .from("locations")
      .insert({ lat: 9.9, lng: 76.3, label: "Home" })
      .select("id")
      .single();
    if (insErr) throw new HttpError(500, insErr.message);
    return data.id;
  }
  return locs[parseInt(fnv1a(phoneHash), 16) % locs.length].id;
}

export async function pickGroupId(phoneHash: string): Promise<string | null> {
  const { data: groups, error } = await supabaseAdmin.from("groups").select("id").limit(200);
  if (error) throw new HttpError(500, error.message);
  if (!groups || groups.length === 0) return null;
  return groups[parseInt(fnv1a("g" + phoneHash), 16) % groups.length].id;
}

function genToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export async function createSession(
  phoneHash: string,
  role: AccountRole | "admin",
  userId: string,
): Promise<string> {
  const token = genToken();
  const { error } = await supabaseAdmin
    .from("sessions")
    .insert({ token, role, user_id: userId, phone_hash: phoneHash });
  if (error) throw new HttpError(500, error.message);
  return token;
}

// Creates the provider/customer row for a phone that does not have one yet. Details beyond
// the name are left at their defaults — the provider fills skills, rate and experience during
// onboarding via the existing profile endpoints.
export async function createAccount(
  phoneHash: string,
  role: AccountRole,
  name: string,
): Promise<string> {
  if (role === "provider") {
    const [homeLocationId, groupId] = await Promise.all([
      pickLocationId(phoneHash),
      pickGroupId(phoneHash),
    ]);
    const { data, error } = await supabaseAdmin
      .from("providers")
      .insert({
        name,
        phone_hash: phoneHash,
        available: true,
        capacity: 1,
        experience_years: 0,
        rating: 0,
        rating_count: 0,
        languages: ["ml"],
        home_location_id: homeLocationId,
        group_id: groupId,
      })
      .select("id")
      .single();
    if (error) throw new HttpError(500, error.message);
    return data.id;
  }

  const locationId = await pickLocationId(phoneHash);
  const { data, error } = await supabaseAdmin
    .from("customers")
    .insert({ name, phone_hash: phoneHash, location_id: locationId })
    .select("id")
    .single();
  if (error) throw new HttpError(500, error.message);
  return data.id;
}
