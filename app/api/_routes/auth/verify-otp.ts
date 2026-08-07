import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { fnv1a } from "../../_lib/text.js";
import { toE164, testCodeFor, twilioConfigured, checkVerification } from "../../_lib/sms.js";
import { accountId, createSession, rolesForPhone } from "../../_lib/accounts.js";
import { issueTicket } from "../../_lib/ticket.js";

// Role is not accepted — the account decides it, not the caller. Parsed and ignored so an
// older client sending it does not get a 400.
const Body = z.object({
  phone: z.string().min(1),
  code: z.string().min(1),
  role: z.enum(["provider", "customer", "admin"]).optional(),
  name: z.string().optional(),
});

// Mock-path verification. No longer compares `otps.role`: sign-in is role-less now, and that
// column is only written to satisfy its NOT NULL constraint.
async function verifyMockOtp(phoneHash: string, code: string): Promise<void> {
  const { data: otp, error } = await supabaseAdmin
    .from("otps")
    .select("id, expires_at, code_hash")
    .eq("phone_hash", phoneHash)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!otp) throw new HttpError(401, "Request a code first");
  if (new Date(otp.expires_at).getTime() < Date.now()) throw new HttpError(401, "Code expired");
  if (otp.code_hash !== fnv1a("code:" + code)) throw new HttpError(401, "Wrong code");
  await supabaseAdmin.from("otps").delete().eq("id", otp.id);
}

// Three outcomes, because a verified phone does not always determine an account:
//
//   { status: "session", token, role, userId }  exactly one account -> straight to dashboard
//   { status: "choose",  ticket, roles }        registered as both  -> caller picks one
//   { status: "signup",  ticket }               brand new number    -> caller onboards
//
// The ticket is a signed, short-lived proof that this phone passed OTP, redeemed once by
// complete-login. It exists so the OTP itself is never needed twice.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { phone, code } = Body.parse(req.body);
  const e164 = toE164(phone);
  const phoneHash = fnv1a("phone:" + e164);

  const testCode = testCodeFor(e164);
  if (testCode !== null) {
    if (code !== testCode) throw new HttpError(401, "Wrong code");
  } else if (twilioConfigured()) {
    const approved = await checkVerification(e164, code);
    if (!approved) throw new HttpError(401, "Wrong code");
  } else {
    await verifyMockOtp(phoneHash, code);
  }

  const roles = await rolesForPhone(phoneHash);

  if (roles.length === 1) {
    const role = roles[0];
    const userId = await accountId(phoneHash, role);
    if (!userId) throw new HttpError(500, "Account lookup failed");
    const token = await createSession(phoneHash, role, userId);
    res.status(200).json({ status: "session", token, role, userId });
    return;
  }

  if (roles.length > 1) {
    res.status(200).json({ status: "choose", ticket: issueTicket(phoneHash), roles });
    return;
  }

  res.status(200).json({ status: "signup", ticket: issueTicket(phoneHash) });
});
