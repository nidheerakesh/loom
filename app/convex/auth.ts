import { mutation, query, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { roleValidator } from "./schema";
import { fnv1a } from "./lib/text";
import { sessionByToken } from "./lib/session";

// --- Mock phone-OTP auth (demo-only; no Twilio, no JWT provider) ---

const OTP_TTL_MS = 5 * 60 * 1000;

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function genToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

// Pick a deterministic seeded location so a fresh signup is matchable within the cluster.
async function pickLocation(ctx: MutationCtx, phone: string): Promise<Id<"locations">> {
  const locs = await ctx.db.query("locations").take(200);
  if (locs.length === 0) {
    return ctx.db.insert("locations", { lat: 9.9, lng: 76.3, label: "Home" });
  }
  const idx = parseInt(fnv1a(phone), 16) % locs.length;
  return locs[idx]._id;
}

async function pickGroup(ctx: MutationCtx, phone: string): Promise<Id<"groups"> | undefined> {
  const groups = await ctx.db.query("groups").take(200);
  if (groups.length === 0) return undefined;
  const idx = parseInt(fnv1a("g" + phone), 16) % groups.length;
  return groups[idx]._id;
}

export const requestOtp = mutation({
  args: { phone: v.string(), role: roleValidator },
  handler: async (ctx, { phone, role }) => {
    const phoneHash = fnv1a("phone:" + phone);
    // clear prior codes for this phone
    const prior = await ctx.db
      .query("otps")
      .withIndex("by_phoneHash", (q) => q.eq("phoneHash", phoneHash))
      .collect();
    for (const p of prior) await ctx.db.delete("otps", p._id);

    const code = genCode();
    await ctx.db.insert("otps", {
      phoneHash,
      codeHash: fnv1a("code:" + code),
      role,
      expiresAt: Date.now() + OTP_TTL_MS,
    });
    console.log(`[mock-otp] phone=${phone} code=${code} role=${role}`);
    // Demo convenience: return the code so the UI can show it (no real SMS).
    return { devCode: code };
  },
});

export const verifyOtp = mutation({
  args: {
    phone: v.string(),
    code: v.string(),
    role: roleValidator,
    name: v.optional(v.string()),
  },
  handler: async (ctx, { phone, code, role, name }) => {
    const phoneHash = fnv1a("phone:" + phone);
    const otp = await ctx.db
      .query("otps")
      .withIndex("by_phoneHash", (q) => q.eq("phoneHash", phoneHash))
      .unique();
    if (!otp || otp.role !== role) throw new Error("Request a code first");
    if (otp.expiresAt < Date.now()) throw new Error("Code expired");
    if (otp.codeHash !== fnv1a("code:" + code)) throw new Error("Wrong code");
    await ctx.db.delete("otps", otp._id);

    let userId: string;
    if (role === "provider") {
      const existing = await ctx.db
        .query("providers")
        .withIndex("by_phoneHash", (q) => q.eq("phoneHash", phoneHash))
        .unique();
      if (existing) {
        userId = existing._id;
      } else {
        const locationId = await pickLocation(ctx, phone);
        const groupId = await pickGroup(ctx, phone);
        userId = await ctx.db.insert("providers", {
          name: name ?? "New provider",
          phoneHash,
          available: true,
          capacity: 1,
          experienceYears: 0,
          rating: 0,
          ratingCount: 0,
          languages: ["ml"],
          homeLocationId: locationId,
          groupId,
        });
      }
    } else if (role === "customer") {
      const existing = await ctx.db
        .query("customers")
        .withIndex("by_phoneHash", (q) => q.eq("phoneHash", phoneHash))
        .unique();
      if (existing) {
        userId = existing._id;
      } else {
        const locationId = await pickLocation(ctx, phone);
        userId = await ctx.db.insert("customers", {
          name: name ?? "New customer",
          phoneHash,
          locationId,
        });
      }
    } else {
      userId = "admin";
    }

    const token = genToken();
    await ctx.db.insert("sessions", { token, role, userId, phoneHash });
    return { token, role, userId };
  },
});

export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await sessionByToken(ctx, token);
    if (!s) return null;
    if (s.role === "provider") {
      const p = await ctx.db.get("providers", s.userId as Id<"providers">);
      return p ? { role: s.role, userId: s.userId, provider: p } : null;
    }
    if (s.role === "customer") {
      const c = await ctx.db.get("customers", s.userId as Id<"customers">);
      return c ? { role: s.role, userId: s.userId, customer: c } : null;
    }
    return { role: s.role, userId: s.userId };
  },
});

export const signOut = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const s = await sessionByToken(ctx, token);
    if (s) await ctx.db.delete("sessions", s._id);
    return null;
  },
});
