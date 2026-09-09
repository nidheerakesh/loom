// Real phone-OTP delivery via Twilio Verify (ported from convex/lib/sms.ts, unchanged
// logic — only the env-var source moves from Convex env to Vercel env). Twilio Verify
// owns the code itself (generation, expiry, attempt limits) — we never see or store it.
//
// Also adds a test-number bypass: reserved phone numbers mapped to a fixed code, checked
// BEFORE Twilio, so QA can log in on production with zero real SMS and zero cost.
//   npx vercel env add TWILIO_ACCOUNT_SID
//   npx vercel env add TWILIO_AUTH_TOKEN
//   npx vercel env add TWILIO_VERIFY_SERVICE_SID
//   npx vercel env add OTP_TEST_NUMBERS   # e.g. "+919999900001:123456,+919999900002:123456"
// If Twilio env vars are unset, callers fall back to an on-screen mock code (demo-only).

import { HttpError } from "./http.js";

// TWILIO_DISABLED is a kill switch separate from the credentials themselves, so turning Twilio
// off for the sprint before a demo doesn't mean re-pasting three secrets to turn it back on.
// With it set, every number — including a real one — gets the on-screen code instead of an SMS.
// That is strictly weaker than the 21608-only fallback: it applies to numbers Twilio could have
// reached too, so anyone who can call this endpoint for a given number can read that number's
// code. Turn it off again before a real user signs in for keeps.
export function twilioConfigured(): boolean {
  if (process.env.TWILIO_DISABLED === "true") return false;
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID,
  );
}

// Kudumbashree deployment target is Kerala — bare 10-digit numbers are Indian mobiles.
export function toE164(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  // HttpError, not Error: a plain Error becomes a bare 500 "Internal error", which is what a
  // mistyped phone number used to produce — a user mistake reported as a server crash.
  throw new HttpError(400, "Enter a valid 10-digit phone number", "bad-phone");
}

// Reserved test numbers, e.g. "+919999900001:123456,+919999900002:123456" — these
// never touch Twilio at all, in requestOtp OR verifyOtp, so they cost nothing and
// work identically on every environment (local, preview, prod).
export function testCodeFor(e164: string): string | null {
  const raw = process.env.OTP_TEST_NUMBERS;
  if (!raw) return null;
  for (const pair of raw.split(",")) {
    const [num, code] = pair.split(":").map((s) => s.trim());
    if (num === e164) return code || null;
  }
  return null;
}

// Numbers that get an admin session instead of a provider/customer one, e.g.
//   npx vercel env add ADMIN_PHONES     # "+919876500000,+919876500001"
// Unset means nobody is an admin, which is the right default for a moderation surface: the
// alternative is a route that can promote its own caller.
export function isAdminPhone(e164: string): boolean {
  const raw = process.env.ADMIN_PHONES;
  if (!raw) return false;
  return raw.split(",").map((n) => n.trim()).filter(Boolean).includes(e164);
}

function authHeader(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

// "sent", or "unverified-recipient" meaning Twilio will never deliver to this number at all.
// The second is a fact about the destination rather than a fault, so the caller decides what to
// do about it. Every other failure still throws — see the comment on the 21608 branch below for
// why that distinction is load-bearing rather than tidy.
export type StartResult = "sent" | "unverified-recipient";

export async function startVerification(e164: string): Promise<StartResult> {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  const res = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`, {
    method: "POST",
    headers: { authorization: authHeader(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: e164, Channel: "sms" }),
  });
  if (res.ok) return "sent";

  // Twilio puts a numeric `code` and a human `message` in the error body. Both go to the log:
  // every send failure used to surface as "Internal error", which says nothing about whether
  // the fault is the number, the account, or the service.
  const body = await res.text();
  let twilioCode: number | undefined;
  try {
    twilioCode = JSON.parse(body)?.code;
  } catch {
    /* non-JSON error body; the raw text below is the whole diagnostic */
  }
  console.error(`[twilio] start ${res.status} code=${twilioCode ?? "?"}: ${body.slice(0, 300)}`);

  // 21608 is the trial-account restriction: a destination not on the console's verified list.
  // No SMS will ever arrive for it, so retrying is pointless and the caller needs to know.
  //
  // This is matched on the numeric body code and NOT on `res.status === 400`, deliberately. A
  // malformed request is also a 400, and treating the two alike would let a bad parameter open
  // the caller's fallback path. Everything below still throws for the same reason: if a rate
  // limit or a revoked credential could reach the fallback, then breaking Twilio would be how
  // you sign in as somebody else.
  if (twilioCode === 21608) return "unverified-recipient";
  if (res.status === 429) {
    throw new HttpError(429, "Too many codes requested. Wait a few minutes.", "send-rate-limited");
  }
  throw new HttpError(502, "Could not send the code — try again", "send-failed");
}

// Twilio Verify owns the code, so "wrong code" is its verdict, not ours — but that verdict has
// several distinct causes that all arrived here as a single `false`:
//
//   wrong-code       the digits genuinely do not match
//   code-expired     no pending verification: it aged out (~10 min), was already approved,
//                    or a second "send code" tap cancelled the SMS she is reading
//   too-many-tries   Twilio locked this verification after repeated wrong guesses
//
// Collapsing these told her to re-read a code that could no longer work no matter how
// carefully she typed it. Each one now has its own instruction.
export type CheckResult =
  | { approved: true }
  | { approved: false; reason: "wrong-code" | "code-expired" | "too-many-tries" };

export async function checkVerification(e164: string, code: string): Promise<CheckResult> {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  const res = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/VerificationChecks`, {
    method: "POST",
    headers: { authorization: authHeader(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: e164, Code: code.trim() }),
  });

  if (!res.ok) {
    const body = await res.text();
    let twilioCode: number | undefined;
    try {
      twilioCode = JSON.parse(body)?.code;
    } catch {
      /* non-JSON error body */
    }
    console.error(`[twilio] check ${res.status} code=${twilioCode ?? "?"}: ${body.slice(0, 300)}`);

    // 404: the verification is simply gone. 60202: the max-check-attempts limit.
    if (res.status === 404) return { approved: false, reason: "code-expired" };
    if (twilioCode === 60202 || res.status === 429) return { approved: false, reason: "too-many-tries" };
    throw new HttpError(502, "Could not check the code — try again", "check-failed");
  }

  const data = await res.json();
  if (data?.status === "approved") return { approved: true };

  console.error(`[twilio] check status=${data?.status} for ${e164}`);
  // "canceled" means a newer verification replaced this one — same practical advice as expiry:
  // the SMS in her hand is dead, ask for a fresh one.
  return { approved: false, reason: data?.status === "canceled" ? "code-expired" : "wrong-code" };
}
