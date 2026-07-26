import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSession, sessionByToken } from "./lib/session";

// Grievance portal (M16). Simple submit + status tracking.
export const submit = mutation({
  args: { token: v.string(), subject: v.string(), body: v.string() },
  handler: async (ctx, { token, subject, body }) => {
    const s = await requireSession(ctx, token);
    await ctx.db.insert("grievances", {
      reporterId: s.userId,
      reporterRole: s.role,
      subject,
      body,
      status: "open",
    });
    return null;
  },
});

export const mine = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await sessionByToken(ctx, token);
    if (!s) return [];
    const rows = await ctx.db
      .query("grievances")
      .withIndex("by_reporter", (q) => q.eq("reporterId", s.userId))
      .order("desc")
      .take(50);
    return rows.map((g) => ({ _id: g._id, subject: g.subject, body: g.body, status: g.status }));
  },
});
