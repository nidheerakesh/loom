import { query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { sessionByToken } from "./lib/session";
import { distanceKm } from "./lib/geo";
import { score, skillFit } from "./lib/scoring";

// Individual "Find work" feed for a provider. Read-only + deterministic: same data → same
// ranking. Audit rows + narration are written when the provider opens a match (narration.ts).
export const individualFeed = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await sessionByToken(ctx, token);
    if (!s || s.role !== "provider") return [];
    const providerId = s.userId as Id<"providers">;
    const provider = await ctx.db.get("providers", providerId);
    if (!provider) return [];

    const mySkillRows = await ctx.db
      .query("providerSkills")
      .withIndex("by_provider", (q) => q.eq("providerId", providerId))
      .collect();
    const profBySkill = new Map<string, number>();
    for (const r of mySkillRows) profBySkill.set(r.skillId, r.proficiency);

    const requestIds = new Set<string>();
    for (const skillId of profBySkill.keys()) {
      const rs = await ctx.db
        .query("requestSkills")
        .withIndex("by_skill", (q) => q.eq("skillId", skillId as Id<"skills">))
        .collect();
      for (const row of rs) requestIds.add(row.requestId);
    }

    const cards = [];
    for (const rid of requestIds) {
      const r = await ctx.db.get("requests", rid as Id<"requests">);
      if (!r || r.status !== "open") continue;
      const reqSkills = await ctx.db
        .query("requestSkills")
        .withIndex("by_request", (q) => q.eq("requestId", r._id))
        .collect();
      let bestProf = 0;
      let matchedSkillId: Id<"skills"> | null = null;
      for (const rs of reqSkills) {
        const prof = profBySkill.get(rs.skillId);
        if (prof !== undefined && prof > bestProf) {
          bestProf = prof;
          matchedSkillId = rs.skillId;
        }
      }
      if (matchedSkillId === null) continue;
      const dist = await distanceKm(ctx, provider.homeLocationId, r.locationId);
      const sc = score(skillFit(bestProf), dist, r.pay ?? undefined);
      const matchedSkill = await ctx.db.get("skills", matchedSkillId);
      cards.push({
        requestId: r._id,
        title: r.title,
        mode: r.mode,
        units: r.units,
        pay: r.pay ?? null,
        distanceKm: dist,
        matchedSkill: matchedSkill?.canonicalName ?? "",
        matchedSkillMl: matchedSkill?.canonicalNameMl ?? null,
        total: sc.total,
      });
    }
    cards.sort((a, b) => (b.total !== a.total ? b.total - a.total : a.requestId < b.requestId ? -1 : 1));
    return cards.slice(0, 20);
  },
});
