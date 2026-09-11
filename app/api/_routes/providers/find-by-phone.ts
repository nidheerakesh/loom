import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";
import { toE164 } from "../../_lib/sms.js";
import { hashPhone } from "../../_lib/text.js";

const Body = z.object({ token: z.string().min(1), phone: z.string().min(1) });

// The customer's way to appoint someone who never applied: name her by phone number, not by
// browsing every provider in the app. providers/search lists everyone and was the bug here —
// a "pick a coordinator" screen that doubles as a directory of strangers is how you end up
// appointing someone who has nothing to do with this job. A phone number is something she
// already has to know about the person she means to name.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, phone } = Body.parse(req.body);
  await requireRole(token, "customer");

  const phoneHash = hashPhone(toE164(phone));
  const { data, error } = await supabaseAdmin
    .from("providers")
    .select("id, name, shop_name")
    .eq("phone_hash", phoneHash)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);

  res.status(200).json(data ? { _id: data.id, name: data.name, shopName: data.shop_name } : null);
});
