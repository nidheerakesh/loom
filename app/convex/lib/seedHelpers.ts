import { MutationCtx } from "../_generated/server";
import { Id, TableNames } from "../_generated/dataModel";
import { haversine } from "./geo";

// Reference (catalogue + geography) is required for the app to function: providers resolve
// skills against it, customers pick skills from it, matching needs locations/distances.
// User data (accounts, requests, teams, chat…) is separate and cleared on reset.

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

// All user-generated tables (cleared on reset). Reference tables are NOT here.
export const USER_TABLES: TableNames[] = [
  "providerSkills", "portfolioItems", "providers", "customers",
  "requestSkills", "requests", "interests", "teamMembers", "teams",
  "matches", "narrations", "ratings", "grievances", "messages", "chatThreads",
  "skillCandidates", "sessions", "otps",
];

export const REFERENCE_TABLES: TableNames[] = [
  "skillAliases", "skills", "nearDistances", "locations", "groups", "cds",
];

export async function clearTables(ctx: MutationCtx, tables: TableNames[]): Promise<void> {
  for (const table of tables) {
    const rows = await ctx.db.query(table).collect();
    for (const r of rows) await ctx.db.delete(table, r._id);
  }
}

export type Reference = {
  skillId: Record<string, Id<"skills">>;
  groupIds: Id<"groups">[];
  locIds: Id<"locations">[];
};

// Idempotent: clears reference tables then rebuilds them deterministically.
export async function seedReference(ctx: MutationCtx): Promise<Reference> {
  await clearTables(ctx, REFERENCE_TABLES);

  const cdsId = await ctx.db.insert("cds", { name: "Ernakulam CDS", panchayat: "Ernakulam" });
  const groupIds: Id<"groups">[] = [];
  for (let i = 0; i < 6; i++) {
    groupIds.push(await ctx.db.insert("groups", { name: `SHG ${i + 1}`, cdsId }));
  }

  const locIds: Id<"locations">[] = [];
  for (let i = 0; i < LOCATION_LABELS.length; i++) {
    const lat = 9.95 + (i % 4) * 0.02 + Math.floor(i / 4) * 0.015;
    const lng = 76.28 + (i % 3) * 0.02 + Math.floor(i / 3) * 0.01;
    locIds.push(await ctx.db.insert("locations", { lat, lng, label: LOCATION_LABELS[i] }));
  }
  for (let i = 0; i < locIds.length; i++) {
    for (let j = 0; j < locIds.length; j++) {
      if (i === j) continue;
      const a = await ctx.db.get("locations", locIds[i]);
      const b = await ctx.db.get("locations", locIds[j]);
      if (!a || !b) continue;
      await ctx.db.insert("nearDistances", {
        fromLocationId: locIds[i],
        toLocationId: locIds[j],
        distanceKm: haversine(a.lat, a.lng, b.lat, b.lng),
      });
    }
  }

  const skillId: Record<string, Id<"skills">> = {};
  for (const sk of SKILLS) {
    const id = await ctx.db.insert("skills", {
      canonicalName: sk.name,
      canonicalNameMl: sk.ml,
      iconKey: sk.icon,
    });
    skillId[sk.name] = id;
    for (const alias of sk.aliases) {
      await ctx.db.insert("skillAliases", { skillId: id, aliasText: alias.toLowerCase(), source: "curated" });
    }
  }

  return { skillId, groupIds, locIds };
}
