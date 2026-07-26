import { QueryCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

// Demo-only bearer-token auth. No external JWT provider is configured, so functions take
// a session `token` and resolve identity server-side here. Real deployments should swap
// this for Convex Auth + ctx.auth.getUserIdentity().

export async function sessionByToken(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"sessions"> | null> {
  return ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
}

export async function requireSession(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"sessions">> {
  const s = await sessionByToken(ctx, token);
  if (!s) throw new Error("Not authenticated");
  return s;
}

export async function requireRole(
  ctx: QueryCtx,
  token: string,
  role: "provider" | "customer" | "admin",
): Promise<Doc<"sessions">> {
  const s = await requireSession(ctx, token);
  if (s.role !== role) throw new Error(`Requires ${role} role`);
  return s;
}
