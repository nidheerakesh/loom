import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireRole, sessionByToken } from "./lib/session";

export const updateProfile = mutation({
  args: {
    token: v.string(),
    name: v.optional(v.string()),
    company: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const s = await requireRole(ctx, args.token, "customer");
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.company !== undefined) patch.company = args.company;
    await ctx.db.patch("customers", s.userId as Id<"customers">, patch);
    return null;
  },
});

export const myRequests = query({
  args: { token: v.string(), status: v.optional(v.string()) },
  handler: async (ctx, { token, status }) => {
    const s = await sessionByToken(ctx, token);
    if (!s || s.role !== "customer") return [];
    const rows = await ctx.db
      .query("requests")
      .withIndex("by_customer", (q) => q.eq("customerId", s.userId as Id<"customers">))
      .order("desc")
      .collect();
    const out = [];
    for (const r of rows) {
      if (status && r.status !== status) continue;
      const interests = await ctx.db
        .query("interests")
        .withIndex("by_request", (q) => q.eq("requestId", r._id))
        .collect();
      const accepted = interests.filter((i) => i.state === "accepted").length;
      const team = await ctx.db
        .query("teams")
        .withIndex("by_request", (q) => q.eq("requestId", r._id))
        .first();
      out.push({
        _id: r._id,
        title: r.title,
        mode: r.mode,
        units: r.units,
        status: r.status,
        interestedCount: interests.filter((i) => i.state === "interested").length,
        acceptedCount: accepted,
        teamId: team?._id ?? null,
      });
    }
    return out;
  },
});

// "People you've worked with" — providers who accepted this customer's requests
// or joined a confirmed team for one.
export const history = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await sessionByToken(ctx, token);
    if (!s || s.role !== "customer") return [];
    const requests = await ctx.db
      .query("requests")
      .withIndex("by_customer", (q) => q.eq("customerId", s.userId as Id<"customers">))
      .collect();

    const providerIds = new Set<string>();
    for (const r of requests) {
      const interests = await ctx.db
        .query("interests")
        .withIndex("by_request", (q) => q.eq("requestId", r._id))
        .collect();
      for (const i of interests) if (i.state === "accepted") providerIds.add(i.providerId);
      const team = await ctx.db
        .query("teams")
        .withIndex("by_request", (q) => q.eq("requestId", r._id))
        .first();
      if (team) {
        const members = await ctx.db
          .query("teamMembers")
          .withIndex("by_team", (q) => q.eq("teamId", team._id))
          .collect();
        for (const m of members) if (m.state === "accepted") providerIds.add(m.providerId);
      }
    }

    const out = [];
    for (const pid of providerIds) {
      const p = await ctx.db.get("providers", pid as Id<"providers">);
      if (p)
        out.push({
          _id: p._id,
          name: p.name,
          shopName: p.shopName ?? null,
          rating: p.rating,
        });
    }
    return out;
  },
});
