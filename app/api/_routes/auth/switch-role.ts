import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { requireSession } from "../../_lib/auth.js";
import { accountId, createAccount, createSession } from "../../_lib/accounts.js";

// Switch the signed-in phone to its other role, creating that account the first time.
//
// Without this, a second role is unreachable: verify-otp goes straight to a session as soon
// as the phone has any account, so the "choose" branch could never come into existence. A
// stitcher who also wants to hire a caterer starts here.
const Body = z.object({
  token: z.string().min(1),
  role: z.enum(["provider", "customer"]),
  name: z.string().trim().min(1).max(80).optional(),
});

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, role, name } = Body.parse(req.body);
  const session = await requireSession(token);

  if (session.role === role) throw new HttpError(400, "Already signed in with that role");

  let userId = await accountId(session.phoneHash, role);
  if (!userId) {
    if (!name) throw new HttpError(400, "Name is required to create an account");
    userId = await createAccount(session.phoneHash, role, name);
  }

  // A fresh session rather than mutating the old one, so the previous token keeps working
  // until the client swaps it — no window where the app holds a token pointing at a role it
  // has not rendered yet.
  const newToken = await createSession(session.phoneHash, role, userId);
  res.status(200).json({ status: "session", token: newToken, role, userId });
});
