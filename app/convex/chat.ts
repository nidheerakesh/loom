import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSession, sessionByToken } from "./lib/session";

// Community chat (M10). Human-to-human, entirely OUTSIDE the match decision.
const contextTypeValidator = v.union(
  v.literal("provider"),
  v.literal("request"),
  v.literal("team"),
  v.literal("direct"),
);

export const openThread = mutation({
  args: { token: v.string(), contextType: contextTypeValidator, contextId: v.string(), title: v.string() },
  handler: async (ctx, { token, contextType, contextId, title }) => {
    await requireSession(ctx, token);
    const existing = await ctx.db
      .query("chatThreads")
      .withIndex("by_context", (q) => q.eq("contextType", contextType).eq("contextId", contextId))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("chatThreads", { contextType, contextId, title });
  },
});

export const listThreads = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await sessionByToken(ctx, token);
    if (!s) return [];
    const threads = await ctx.db.query("chatThreads").order("desc").take(50);
    const out = [];
    for (const t of threads) {
      const last = await ctx.db
        .query("messages")
        .withIndex("by_thread", (q) => q.eq("threadId", t._id))
        .order("desc")
        .first();
      out.push({ _id: t._id, title: t.title, lastMessage: last?.body ?? null });
    }
    return out;
  },
});

export const listMessages = query({
  args: { token: v.string(), threadId: v.id("chatThreads") },
  handler: async (ctx, { token, threadId }) => {
    const s = await sessionByToken(ctx, token);
    if (!s) return [];
    const msgs = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", threadId))
      .order("asc")
      .take(200);
    return msgs.map((m) => ({
      _id: m._id,
      body: m.body,
      senderId: m.senderId,
      senderRole: m.senderRole,
      mine: m.senderId === s.userId,
    }));
  },
});

export const send = mutation({
  args: { token: v.string(), threadId: v.id("chatThreads"), body: v.string() },
  handler: async (ctx, { token, threadId, body }) => {
    const s = await requireSession(ctx, token);
    if (!body.trim()) return null;
    await ctx.db.insert("messages", {
      threadId,
      senderId: s.userId,
      senderRole: s.role,
      body: body.trim(),
    });
    return null;
  },
});
