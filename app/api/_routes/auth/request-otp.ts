import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler } from "../../_lib/http";
import { supabaseAdmin } from "../../_lib/supabase";
import { fnv1a } from "../../_lib/text";
import { toE164, testCodeFor, twilioConfigured, startVerification } from "../../_lib/sms";

const Body = z.object({
  phone: z.string().min(1),
  role: z.enum(["provider", "customer", "admin"]),
});

const OTP_TTL_MS = 5 * 60 * 1000;

function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Mock fallback: only reached when the number isn't a reserved test number AND
// Twilio isn't configured (local/demo dev with no keys at all).
// Upsert on the phone_hash unique constraint, not delete-then-insert — two concurrent
// requests for the same number (double-click, dev double-fire) used to race and leave
// two rows behind, which broke verify-otp's .maybeSingle() lookup with a Postgres
// "multiple rows returned" error. Upsert is atomic at the DB level, no race window.
async function storeMockOtp(phoneHash: string, role: string): Promise<string> {
  const code = genCode();
  await supabaseAdmin.from("otps").upsert(
    {
      phone_hash: phoneHash,
      code_hash: fnv1a("code:" + code),
      role,
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    },
    { onConflict: "phone_hash" },
  );
  return code;
}

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { phone, role } = Body.parse(req.body);
  const e164 = toE164(phone);
  const phoneHash = fnv1a("phone:" + e164);

  // 1. Reserved test numbers bypass everything — no SMS, no cost, works on any env.
  if (testCodeFor(e164) !== null) {
    res.status(200).json({ devCode: null });
    return;
  }

  // 2. Real SMS via Twilio Verify when configured.
  if (twilioConfigured()) {
    await startVerification(e164);
    res.status(200).json({ devCode: null });
    return;
  }

  // 3. Keyless mock fallback (local/demo dev only) — code shown on screen.
  const code = await storeMockOtp(phoneHash, role);
  console.log(`[mock-otp] phone=${e164} code=${code} role=${role}`);
  res.status(200).json({ devCode: code });
});
