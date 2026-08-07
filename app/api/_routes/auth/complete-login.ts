import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { accountId, createAccount, createSession } from "../../_lib/accounts.js";
import { redeemTicket } from "../../_lib/ticket.js";

// Second half of sign-in, for the two cases verify-otp cannot finish on its own:
//   - "signup": brand-new phone. `name` is required; the account is created here.
//   - "choose": phone registered as both provider and customer, and the caller picked one.
// Both redeem the signed ticket verify-otp issued, so the OTP is never spent twice.
const Body = z.object({
  ticket: z.string().min(1),
  role: z.enum(["provider", "customer"]),
  name: z.string().trim().min(1).max(80).optional(),
});

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { ticket, role, name } = Body.parse(req.body);
  const phoneHash = redeemTicket(ticket);

  let userId = await accountId(phoneHash, role);
  if (!userId) {
    // Creating the account, so we need something to call them.
    if (!name) throw new HttpError(400, "Name is required to create an account");
    userId = await createAccount(phoneHash, role, name);
  }

  const token = await createSession(phoneHash, role, userId);
  res.status(200).json({ status: "session", token, role, userId });
});
