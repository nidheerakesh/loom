import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { requireRole, sessionByToken } from "./lib/session";
import { distanceKm } from "./lib/geo";
import { skillFit } from "./lib/scoring";

export const updateProfile = mutation({
  args: {
    token: v.string(),
    name: v.optional(v.string()),
    shopName: v.optional(v.string()),
    capacity: v.optional(v.number()),
    rate: v.optional(v.number()),
    rateUnit: v.optional(v.string()),
    deliveryDays: v.optional(v.number()),
    experienceYears: v.optional(v.number()),
    languages: v.optional(v.array(v.string())),
    available: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const s = await requireRole(ctx, args.token, "provider");
    const { token, ...rest } = args;
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(rest)) {
      if (val !== undefined) patch[k] = val;
    }
    await ctx.db.patch("providers", s.userId as Id<"providers">, patch);
    return null;
  },
});

async function hydrateCard(
  ctx: QueryCtx,
  provider: Doc<"providers">,
  fromLocationId: Id<"locations"> | null,
  matchedSkillId?: Id<"skills">,
) {
  const skillRows = await ctx.db
    .query("providerSkills")
    .withIndex("by_provider", (q) => q.eq("providerId", provider._id))
    .collect();
  const skills = [];
  let matchedProficiency = 0;
  for (const row of skillRows) {
    const sk = await ctx.db.get("skills", row.skillId);
    if (sk) {
      skills.push({ _id: sk._id, canonicalName: sk.canonicalName, canonicalNameMl: sk.canonicalNameMl ?? null, iconKey: sk.iconKey });
      if (matchedSkillId && row.skillId === matchedSkillId) matchedProficiency = row.proficiency;
    }
  }
  const dist = fromLocationId ? await distanceKm(ctx, fromLocationId, provider.homeLocationId) : null;
  return {
    _id: provider._id,
    name: provider.name,
    shopName: provider.shopName ?? null,
    capacity: provider.capacity,
    rate: provider.rate ?? null,
    rateUnit: provider.rateUnit ?? null,
    deliveryDays: provider.deliveryDays ?? null,
    experienceYears: provider.experienceYears,
    rating: provider.rating,
    ratingCount: provider.ratingCount,
    languages: provider.languages,
    distanceKm: dist,
    skills,
    matchedProficiency,
  };
}

// Customer directory search (Feature 3 / TDD §6.4): filter-then-rank, deterministic.
export const search = query({
  args: {
    token: v.string(),
    skillId: v.optional(v.id("skills")),
    maxDistanceKm: v.optional(v.number()),
    minExperience: v.optional(v.number()),
    maxRate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const s = await sessionByToken(ctx, args.token);
    let fromLocationId: Id<"locations"> | null = null;
    if (s?.role === "customer") {
      const c = await ctx.db.get("customers", s.userId as Id<"customers">);
      fromLocationId = c?.locationId ?? null;
    }

    // candidate providers by skill (or all if no skill given)
    let providerIds: Id<"providers">[];
    if (args.skillId) {
      const rows = await ctx.db
        .query("providerSkills")
        .withIndex("by_skill", (q) => q.eq("skillId", args.skillId!))
        .collect();
      providerIds = [...new Set(rows.map((r) => r.providerId))];
    } else {
      const all = await ctx.db.query("providers").take(500);
      providerIds = all.map((p) => p._id);
    }

    const cards = [];
    for (const pid of providerIds) {
      const p = await ctx.db.get("providers", pid);
      if (!p || !p.available) continue;
      // hard filters (deterministic)
      if (args.minExperience !== undefined && p.experienceYears < args.minExperience) continue;
      if (args.maxRate !== undefined) {
        if (p.rate === undefined || p.rate > args.maxRate) continue;
      }
      const card = await hydrateCard(ctx, p, fromLocationId, args.skillId);
      if (args.maxDistanceKm !== undefined && card.distanceKm !== null && card.distanceKm > args.maxDistanceKm) continue;
      cards.push(card);
    }

    // rank: skillFit + proximity + normalized rating; deterministic tiebreak on _id
    cards.sort((a, b) => {
      const ra =
        skillFit(a.matchedProficiency) +
        (a.distanceKm !== null ? 1 / (1 + a.distanceKm) : 0) +
        a.rating / 5;
      const rb =
        skillFit(b.matchedProficiency) +
        (b.distanceKm !== null ? 1 / (1 + b.distanceKm) : 0) +
        b.rating / 5;
      if (rb !== ra) return rb - ra;
      return a._id < b._id ? -1 : 1;
    });
    return cards;
  },
});

export const getProfile = query({
  args: { providerId: v.id("providers") },
  handler: async (ctx, { providerId }) => {
    const p = await ctx.db.get("providers", providerId);
    if (!p) return null;
    const card = await hydrateCard(ctx, p, null);
    const portfolioRows = await ctx.db
      .query("portfolioItems")
      .withIndex("by_provider", (q) => q.eq("providerId", providerId))
      .collect();
    const portfolio = [];
    for (const item of portfolioRows) {
      const url = item.storageId ? await ctx.storage.getUrl(item.storageId) : null;
      portfolio.push({ _id: item._id, url, caption: item.caption ?? null });
    }
    const ratingRows = await ctx.db
      .query("ratings")
      .withIndex("by_provider", (q) => q.eq("providerId", providerId))
      .order("desc")
      .take(10);
    return { ...card, portfolio, reviews: ratingRows.map((r) => ({ stars: r.stars, comment: r.comment ?? null })) };
  },
});

export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    await requireRole(ctx, token, "provider");
    return await ctx.storage.generateUploadUrl();
  },
});

export const addPortfolioItem = mutation({
  args: { token: v.string(), storageId: v.id("_storage"), caption: v.optional(v.string()) },
  handler: async (ctx, { token, storageId, caption }) => {
    const s = await requireRole(ctx, token, "provider");
    await ctx.db.insert("portfolioItems", {
      providerId: s.userId as Id<"providers">,
      storageId,
      caption,
    });
    return null;
  },
});

export const myPortfolio = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await sessionByToken(ctx, token);
    if (!s || s.role !== "provider") return [];
    const rows = await ctx.db
      .query("portfolioItems")
      .withIndex("by_provider", (q) => q.eq("providerId", s.userId as Id<"providers">))
      .collect();
    const out = [];
    for (const item of rows) {
      const url = item.storageId ? await ctx.storage.getUrl(item.storageId) : null;
      out.push({ _id: item._id, url, caption: item.caption ?? null });
    }
    return out;
  },
});
