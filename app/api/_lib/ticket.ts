import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "./http.js";

// Short-lived signed proof that a phone number just passed OTP verification.
//
// Login is phone + OTP only, so the server cannot always issue a session straight away: a
// brand-new number has no account yet, and a number registered as BOTH provider and customer
// needs the caller to pick one. In both cases verify-otp hands back a ticket, and
// complete-login redeems it once the missing piece is known.
//
// Stateless on purpose. The alternative — parking a row in `otps` — would need a nullable
// role column, and altering the live schema needs DB credentials we do not have here.
// Signing sidesteps that: nothing is stored, and the ticket cannot be forged or replayed
// past its expiry.

const TTL_MS = 10 * 60 * 1000;

function secret(): string {
  // A dedicated secret is preferred. Falling back to the service role key keeps this working
  // on deployments that have not set one — it never leaves the server either way.
  const s = process.env.AUTH_TICKET_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new HttpError(500, "Server missing signing secret");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueTicket(phoneHash: string): string {
  const payload = `${phoneHash}.${Date.now() + TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

// Returns the phone hash the ticket was issued for, or throws.
export function redeemTicket(ticket: string): string {
  const parts = ticket.split(".");
  if (parts.length !== 3) throw new HttpError(401, "Invalid sign-in ticket");
  const [phoneHash, expRaw, got] = parts;

  const want = sign(`${phoneHash}.${expRaw}`);
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  // Compare in constant time, and only after a length check — timingSafeEqual throws on
  // mismatched lengths, which would itself leak information.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new HttpError(401, "Invalid sign-in ticket");
  }

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Date.now()) {
    throw new HttpError(401, "Sign-in expired, please request a new code");
  }
  return phoneHash;
}
