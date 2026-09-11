import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

const Body = z.object({ token: z.string().min(1), skillId: z.string().min(1) });

// She can add a skill by typing or speaking it (skills/resolve.ts), but the only way to undo
// that was never having said it — a skill picked up by mistake, or one she no longer does,
// stayed on her profile forever with no way off. Deleting the pairing, not the canonical skill
// itself: other providers' listings under the same skill are untouched.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, skillId } = Body.parse(req.body);
  const s = await requireRole(token, "provider");

  const { error } = await supabaseAdmin
    .from("provider_skills")
    .delete()
    .eq("provider_id", s.userId)
    .eq("skill_id", skillId);
  if (error) throw new HttpError(500, error.message);

  res.status(200).json(null);
});
