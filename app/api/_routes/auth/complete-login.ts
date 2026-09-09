import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { accountId, createAccount, createSession } from "../../_lib/accounts.js";
import { redeemTicket } from "../../_lib/ticket.js";

// The version shown to her — bump this if the copy changes materially, so a re-agreement can
// be required rather than silently assumed from an older version's row.
const CONSENT_VERSION = "v1";

// Second half of sign-in, for the two cases verify-otp cannot finish on its own:
//   - "signup": brand-new phone. `name` is required; the account is created here.
//   - "choose": phone registered as both provider and customer, and the caller picked one.
// Both redeem the signed ticket verify-otp issued, so the OTP is never spent twice.
const Body = z.object({
  ticket: z.string().min(1),
  role: z.enum(["provider", "customer"]),
  name: z.string().trim().min(1).max(80).optional(),
  // Only asked of a brand-new number — SignIn.tsx's consent step never runs for a returning
  // one, and "choose" (both roles already exist) never reaches this branch either.
  consent: z.literal(true).optional(),
});

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { ticket, role, name, consent } = Body.parse(req.body);
  const phoneHash = redeemTicket(ticket);

  let userId = await accountId(phoneHash, role);
  if (!userId) {
    // Creating the account, so we need something to call them — and, before that, her
    // agreement to the consent copy. The frontend gates this already, but trusting only the
    // client is how request-otp's mock-OTP write silently stopped happening once before
    // (see storeMockOtp's comment); checked here too, and the write's error is checked rather
    // than assumed, for the same reason.
    if (!name) throw new HttpError(400, "Name is required to create an account");
    if (!consent) throw new HttpError(400, "Consent is required to create an account");
    const { error: consentErr } = await supabaseAdmin
      .from("consents")
      .insert({ phone_hash: phoneHash, version: CONSENT_VERSION });
    if (consentErr) throw new HttpError(500, consentErr.message);
    userId = await createAccount(phoneHash, role, name);
  }

  const token = await createSession(phoneHash, role, userId);
  res.status(200).json({ status: "session", token, role, userId });
});
