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

export function twilioConfigured(): boolean {
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
  throw new Error("Enter a valid 10-digit phone number");
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

export async function startVerification(e164: string): Promise<void> {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  const res = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/Verifications`, {
    method: "POST",
    headers: { authorization: authHeader(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: e164, Channel: "sms" }),
  });
  if (!res.ok) {
    console.error(`[twilio] start ${res.status}: ${(await res.text()).slice(0, 300)}`);
    throw new Error("Could not send code — try again");
  }
}

export async function checkVerification(e164: string, code: string): Promise<boolean> {
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID!;
  const res = await fetch(`https://verify.twilio.com/v2/Services/${serviceSid}/VerificationChecks`, {
    method: "POST",
    headers: { authorization: authHeader(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: e164, Code: code }),
  });
  if (!res.ok) {
    if (res.status === 404) return false; // no pending verification for this number
    console.error(`[twilio] check ${res.status}: ${(await res.text()).slice(0, 300)}`);
    throw new Error("Could not verify code — try again");
  }
  const data = await res.json();
  return data?.status === "approved";
}
