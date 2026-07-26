import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireRole, sessionByToken } from "./lib/session";
import { distanceKm } from "./lib/geo";

export const create = mutation({
  args: {
    token: v.string(),
    title: v.string(),
    description: v.string(),
    mode: v.union(v.literal("individual"), v.literal("group")),
    units: v.number(),
    pay: v.optional(v.number()),
    deadline: v.optional(v.string()),
    skills: v.array(v.object({ skillId: v.id("skills"), quantity: v.number() })),
  },
  handler: async (ctx, args) => {
    const s = await requireRole(ctx, args.token, "customer");
    const customer = await ctx.db.get("customers", s.userId as Id<"customers">);
    if (!customer) throw new Error("Customer not found");

    const requestId = await ctx.db.insert("requests", {
      title: args.title,
      description: args.description,
      mode: args.mode,
      units: args.units,
      pay: args.pay,
      deadline: args.deadline,
      locationId: customer.locationId,
      status: "open",
      customerId: customer._id,
    });
    for (const s2 of args.skills) {
      await ctx.db.insert("requestSkills", {
        requestId,
        skillId: s2.skillId,
        quantity: s2.quantity,
      });
    }
    return { requestId, teamSuggested: args.mode === "group" };
  },
});

export const get = query({
  args: { requestId: v.id("requests") },
  handler: async (ctx, { requestId }) => {
    const r = await ctx.db.get("requests", requestId);
    if (!r) return null;
    const reqSkills = await ctx.db
      .query("requestSkills")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .collect();
    const skills = [];
    for (const rs of reqSkills) {
      const sk = await ctx.db.get("skills", rs.skillId);
      if (sk)
        skills.push({
          _id: sk._id,
          canonicalName: sk.canonicalName,
          canonicalNameMl: sk.canonicalNameMl ?? null,
          quantity: rs.quantity,
        });
    }
    const customer = await ctx.db.get("customers", r.customerId);
    return {
      _id: r._id,
      title: r.title,
      description: r.description,
      mode: r.mode,
      units: r.units,
      pay: r.pay ?? null,
      deadline: r.deadline ?? null,
      status: r.status,
      customerName: customer?.name ?? null,
      skills,
    };
  },
});

// Provider "Requests" tab — open individual requests matching this provider's skills
// that they have not yet responded to.
export const myIncoming = query({
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
    const mySkillIds = new Set(mySkillRows.map((r) => r.skillId));

    const myInterests = await ctx.db
      .query("interests")
      .withIndex("by_provider", (q) => q.eq("providerId", providerId))
      .collect();
    const responded = new Set(myInterests.map((i) => i.requestId));

    const requestIds = new Set<string>();
    for (const skillId of mySkillIds) {
      const rs = await ctx.db
        .query("requestSkills")
        .withIndex("by_skill", (q) => q.eq("skillId", skillId as Id<"skills">))
        .collect();
      for (const row of rs) requestIds.add(row.requestId);
    }

    const out = [];
    for (const rid of requestIds) {
      const r = await ctx.db.get("requests", rid as Id<"requests">);
      if (!r || r.status !== "open" || r.mode !== "individual") continue;
      if (responded.has(r._id)) continue;
      const dist = await distanceKm(ctx, provider.homeLocationId, r.locationId);
      out.push({
        _id: r._id,
        title: r.title,
        units: r.units,
        pay: r.pay ?? null,
        distanceKm: dist,
      });
    }
    out.sort((a, b) => a.distanceKm - b.distanceKm);
    return out;
  },
});

export const respond = mutation({
  args: {
    token: v.string(),
    requestId: v.id("requests"),
    accept: v.boolean(),
  },
  handler: async (ctx, { token, requestId, accept }) => {
    const s = await requireRole(ctx, token, "provider");
    const providerId = s.userId as Id<"providers">;
    const existing = await ctx.db
      .query("interests")
      .withIndex("by_provider", (q) => q.eq("providerId", providerId))
      .filter((q) => q.eq(q.field("requestId"), requestId))
      .first();
    const state = accept ? "accepted" : "declined";
    if (existing) await ctx.db.patch("interests", existing._id, { state });
    else await ctx.db.insert("interests", { providerId, requestId, state });

    if (accept) {
      const r = await ctx.db.get("requests", requestId);
      if (r && r.mode === "individual" && r.status === "open") {
        await ctx.db.patch("requests", requestId, { status: "assigned" });
      }
    }
    return null;
  },
});

// Customer view — who expressed interest / accepted a request.
export const interestedProviders = query({
  args: { token: v.string(), requestId: v.id("requests") },
  handler: async (ctx, { token, requestId }) => {
    await requireRole(ctx, token, "customer");
    const interests = await ctx.db
      .query("interests")
      .withIndex("by_request", (q) => q.eq("requestId", requestId))
      .collect();
    const out = [];
    for (const i of interests) {
      const p = await ctx.db.get("providers", i.providerId);
      if (p)
        out.push({
          providerId: p._id,
          name: p.name,
          shopName: p.shopName ?? null,
          rating: p.rating,
          state: i.state,
        });
    }
    return out;
  },
});
