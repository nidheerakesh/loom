import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http";
import { supabaseAdmin } from "../../_lib/supabase";
import { requireRole } from "../../_lib/auth";

const Body = z.object({
  token: z.string().min(1),
  providerId: z.string().min(1),
  stars: z.number(),
  comment: z.string().optional(),
});

// Reputation. Display-first — the aggregate is NOT used in the match decision.
// Ported from convex/ratings.ts's `rate`.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, providerId, stars, comment } = Body.parse(req.body);
  const s = await requireRole(token, "customer");
  const clamped = Math.max(1, Math.min(5, Math.round(stars)));

  const { error: insErr } = await supabaseAdmin
    .from("ratings")
    .insert({ provider_id: providerId, customer_id: s.userId, stars: clamped, comment });
  if (insErr) throw new HttpError(500, insErr.message);

  const { data: all, error: allErr } = await supabaseAdmin.from("ratings").select("stars").eq("provider_id", providerId);
  if (allErr) throw new HttpError(500, allErr.message);
  const count = all?.length ?? 0;
  const avg = count > 0 ? (all ?? []).reduce((a, r) => a + r.stars, 0) / count : 0;

  const { error: updErr } = await supabaseAdmin
    .from("providers")
    .update({ rating: Math.round(avg * 10) / 10, rating_count: count })
    .eq("id", providerId);
  if (updErr) throw new HttpError(500, updErr.message);

  res.status(200).json(null);
});
