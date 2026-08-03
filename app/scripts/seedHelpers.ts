import { supabaseAdmin } from "../api/_lib/supabase.js";
import { haversine } from "../api/_lib/geo.js";

// Reference (catalogue + geography) is required for the app to function: providers resolve
// skills against it, customers pick skills from it, matching needs locations/distances.
// User data (accounts, requests, teams, chat…) is separate and cleared on reset.
// Ported from convex/lib/seedHelpers.ts.

export const SKILLS: { name: string; ml: string; icon: string; aliases: string[] }[] = [
  { name: "stitching", ml: "തയ്യൽ", icon: "🧵", aliases: ["tailoring", "sewing", "garment sewing", "garment finishing", "stitch", "needlework"] },
  { name: "cutting", ml: "വെട്ട്", icon: "✂️", aliases: ["fabric cutting", "cloth cutting", "cutting work"] },
  { name: "packaging", ml: "പാക്കിംഗ്", icon: "📦", aliases: ["packing", "boxing", "wrapping"] },
  { name: "cooking", ml: "പാചകം", icon: "🍲", aliases: ["catering", "cook", "food preparation", "culinary"] },
  { name: "craft", ml: "കരകൗശലം", icon: "🎨", aliases: ["handicraft", "handcraft", "artisan work"] },
  { name: "tutoring", ml: "ട്യൂഷൻ", icon: "📚", aliases: ["teaching", "tuition", "coaching"] },
];

export const LOCATION_LABELS = [
  "Ernakulam", "Kaloor", "Edappally", "Vyttila", "Palarivattom", "Kakkanad",
  "Thrikkakara", "Aluva", "Tripunithura", "Fort Kochi", "Mattancherry", "Panampilly",
];

// All user-generated tables, in FK-safe delete order (children/no-cascade-blockers first).
// NOT the same order as Convex's USER_TABLES — Convex doesn't enforce foreign keys, Postgres
// does. `matches` references providers/requests WITHOUT cascade (deliberate, it's an audit
// trail — see supabase/schema.sql), so it must be cleared before providers/requests/customers
// or the delete fails with a foreign key violation. Everything else here is FK-cascaded, so
// order among those is only for clarity, not correctness.
export const USER_TABLES = [
  "narrations",
  "matches",
  "ratings",
  "team_members",
  "teams",
  "interests",
  "request_skills",
  "provider_skills",
  "portfolio_items",
  "requests",
  "providers",
  "customers",
  "grievances",
  "messages",
  "chat_threads",
  "skill_candidates",
  "sessions",
  "otps",
] as const;

export const REFERENCE_TABLES = ["skill_aliases", "skills", "near_distances", "locations", "groups", "cds"] as const;

export async function clearTables(tables: readonly string[]): Promise<void> {
  for (const table of tables) {
    const { error } = await supabaseAdmin.from(table).delete().not("id", "is", null);
    if (error) throw new Error(`clearing ${table}: ${error.message}`);
  }
}

export type Reference = {
  skillId: Record<string, string>;
  groupIds: string[];
  locIds: string[];
};

// Idempotent: clears reference tables then rebuilds them deterministically.
export async function seedReference(): Promise<Reference> {
  await clearTables(REFERENCE_TABLES);

  const { data: cds, error: cdsErr } = await supabaseAdmin
    .from("cds")
    .insert({ name: "Ernakulam CDS", panchayat: "Ernakulam" })
    .select("id")
    .single();
  if (cdsErr) throw new Error(cdsErr.message);

  const groupIds: string[] = [];
  for (let i = 0; i < 6; i++) {
    const { data, error } = await supabaseAdmin
      .from("groups")
      .insert({ name: `SHG ${i + 1}`, cds_id: cds.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    groupIds.push(data.id);
  }

  const locs: { id: string; lat: number; lng: number }[] = [];
  for (let i = 0; i < LOCATION_LABELS.length; i++) {
    const lat = 9.95 + (i % 4) * 0.02 + Math.floor(i / 4) * 0.015;
    const lng = 76.28 + (i % 3) * 0.02 + Math.floor(i / 3) * 0.01;
    const { data, error } = await supabaseAdmin
      .from("locations")
      .insert({ lat, lng, label: LOCATION_LABELS[i] })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    locs.push({ id: data.id, lat, lng });
  }
  const nearRows: { from_location_id: string; to_location_id: string; distance_km: number }[] = [];
  for (let i = 0; i < locs.length; i++) {
    for (let j = 0; j < locs.length; j++) {
      if (i === j) continue;
      nearRows.push({
        from_location_id: locs[i].id,
        to_location_id: locs[j].id,
        distance_km: haversine(locs[i].lat, locs[i].lng, locs[j].lat, locs[j].lng),
      });
    }
  }
  const { error: nearErr } = await supabaseAdmin.from("near_distances").insert(nearRows);
  if (nearErr) throw new Error(nearErr.message);

  const skillId: Record<string, string> = {};
  for (const sk of SKILLS) {
    const { data, error } = await supabaseAdmin
      .from("skills")
      .insert({ canonical_name: sk.name, canonical_name_ml: sk.ml, icon_key: sk.icon })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    skillId[sk.name] = data.id;
    const { error: aliasErr } = await supabaseAdmin
      .from("skill_aliases")
      .insert(sk.aliases.map((alias) => ({ skill_id: data.id, alias_text: alias.toLowerCase(), source: "curated" })));
    if (aliasErr) throw new Error(aliasErr.message);
  }

  return { skillId, groupIds, locIds: locs.map((l) => l.id) };
}
