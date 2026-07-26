import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireRole } from "./lib/session";

// Reputation (S12). Display-first — the aggregate is NOT used in the match decision.
export const rate = mutation({
  args: {
    token: v.string(),
    providerId: v.id("providers"),
    stars: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { token, providerId, stars, comment }) => {
    const s = await requireRole(ctx, token, "customer");
    const clamped = Math.max(1, Math.min(5, Math.round(stars)));
    await ctx.db.insert("ratings", {
      providerId,
      customerId: s.userId as Id<"customers">,
      stars: clamped,
      comment,
    });
    // recompute aggregate
    const all = await ctx.db
      .query("ratings")
      .withIndex("by_provider", (q) => q.eq("providerId", providerId))
      .collect();
    const count = all.length;
    const avg = count > 0 ? all.reduce((a, r) => a + r.stars, 0) / count : 0;
    await ctx.db.patch("providers", providerId, {
      rating: Math.round(avg * 10) / 10,
      ratingCount: count,
    });
    return null;
  },
});
