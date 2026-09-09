import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { fnv1a, hashPhone } from "../../_lib/text.js";
import { toE164, testCodeFor, twilioConfigured, startVerification } from "../../_lib/sms.js";

// Sign-in is phone + OTP only. No role: at this point nobody knows whether the number belongs
// to a provider, a customer, both, or neither — that is resolved after the code is verified.
const Body = z.object({ phone: z.string().min(1) });

const OTP_TTL_MS = 5 * 60 * 1000;

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Mock fallback: only reached when the number isn't a reserved test number AND
// Twilio isn't configured (local/demo dev with no keys at all), or for trial-account numbers
// that Twilio refuses (21608) when DEMO_OTP_FALLBACK is not turned off.
// Upsert on the phone_hash unique constraint, not delete-then-insert — two concurrent
// requests for the same number (double-click, dev double-fire) used to race and leave
// two rows behind, which broke verify-otp's .maybeSingle() lookup with a Postgres
// "multiple rows returned" error. Upsert is atomic at the DB level, no race window.
async function storeMockOtp(phoneHash: string): Promise<string> {
  const code = genCode();
  // The error MUST be checked. This write used to be fire-and-forget, and when migration 001
  // dropped the `otps.role` column that this once wrote, the insert began failing with
  // PGRST204 while the handler carried on and returned the code anyway. The user saw an OTP
  // on screen that had never been stored, and verify-otp then told them to request one — an
  // unsignin-able app whose only symptom was a misleading error message.
  const { error } = await supabaseAdmin.from("otps").upsert(
    {
      phone_hash: phoneHash,
      code_hash: fnv1a("code:" + code),
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    },
    { onConflict: "phone_hash" },
  );
  if (error) throw new HttpError(500, error.message);
  return code;
}

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { phone } = Body.parse(req.body);
  const e164 = toE164(phone);
  const phoneHash = hashPhone(e164);

  // 1. Reserved test numbers bypass everything — no SMS, no cost, works on any env.
  if (testCodeFor(e164) !== null) {
    res.status(200).json({ devCode: null });
    return;
  }

  // 2. Real SMS via Twilio Verify when configured.
  //
  // A Twilio trial account only delivers to numbers verified in its console and refuses every
  // other destination with 21608. The seeded demo is around forty fictional numbers and the test
  // suite adds five more; none of them can ever be verified, because nobody owns the handset.
  // An undeliverable number falls through to the on-screen code instead.
  //
  // SECURITY: on that path the code goes to whoever ASKED for it, not to whoever holds the
  // phone, so sign-in stops being authentication for any number it applies to. Confined to
  // numbers Twilio refused outright. Set DEMO_OTP_FALLBACK=off to restore hard failure.
  if (twilioConfigured()) {
    const started = await startVerification(e164);
    if (started === "sent") {
      res.status(200).json({ devCode: null });
      return;
    }
    if (process.env.DEMO_OTP_FALLBACK === "off") {
      throw new HttpError(
        400,
        "This number is not verified in Twilio. A trial account can only send to numbers you have verified in the console.",
        "unverified-recipient",
      );
    }
    console.warn(`[demo-otp-fallback] twilio refused ${e164} (21608) — showing code instead`);
  }

  // 3. Mock fallback — code shown on screen.
  const code = await storeMockOtp(phoneHash);
  console.log(`[mock-otp] phone=${e164} code=${code}`);
  res.status(200).json({ devCode: code });
});
