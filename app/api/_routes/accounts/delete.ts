import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { requireSession } from "../../_lib/auth.js";
import { toE164 } from "../../_lib/sms.js";
import { hashPhone } from "../../_lib/text.js";
import { erasePhone } from "../../_lib/erase.js";

const Body = z.object({ token: z.string().min(1), phone: z.string().min(1) });

// Deleting an account is the one action in this app that cannot be undone, so a live session
// token is deliberately not enough on its own — a token that leaked (a shared device, a phone
// left unlocked) would otherwise be a one-tap way to destroy someone else's account. Retyping
// her own number is the confirmation, and it works as one BECAUSE the number is never shown
// back to her anywhere in the app (mappers.ts drops it) — someone holding only a stolen token
// does not have it memorised.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, phone } = Body.parse(req.body);
  const s = await requireSession(token);
  if (s.role === "admin") throw new HttpError(400, "Admin accounts are not deleted through this route");

  const e164 = toE164(phone);
  if (hashPhone(e164) !== s.phoneHash) {
    throw new HttpError(400, "That number doesn't match your account", "number-mismatch");
  }

  await erasePhone(s.phoneHash);
  res.status(200).json(null);
});
