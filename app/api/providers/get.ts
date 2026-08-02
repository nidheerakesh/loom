import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../_lib/http";
import { supabaseAdmin } from "../_lib/supabase";
import { hydrateCard } from "../_lib/providerCard";

// Ported from convex/providers.ts's `getProfile`.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const providerId = typeof req.query.providerId === "string" ? req.query.providerId : undefined;
  if (!providerId) throw new HttpError(400, "providerId required");

  const { data: p, error: provErr } = await supabaseAdmin
    .from("providers")
    .select(
      "id, seq, name, shop_name, available, capacity, rate, rate_unit, delivery_days, experience_years, rating, rating_count, languages, home_location_id",
    )
    .eq("id", providerId)
    .maybeSingle();
  if (provErr) throw new HttpError(500, provErr.message);
  if (!p) {
    res.status(200).json(null);
    return;
  }

  const card = await hydrateCard(p, null);

  const { data: portfolioRows, error: portErr } = await supabaseAdmin
    .from("portfolio_items")
    .select("id, storage_id, caption")
    .eq("provider_id", providerId);
  if (portErr) throw new HttpError(500, portErr.message);
  const portfolio = (portfolioRows ?? []).map((item) => ({
    _id: item.id,
    url: item.storage_id ? supabaseAdmin.storage.from("portfolio").getPublicUrl(item.storage_id).data.publicUrl : null,
    caption: item.caption ?? null,
  }));

  const { data: ratingRows, error: ratErr } = await supabaseAdmin
    .from("ratings")
    .select("stars, comment")
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (ratErr) throw new HttpError(500, ratErr.message);

  res.status(200).json({
    ...card,
    portfolio,
    reviews: (ratingRows ?? []).map((r) => ({ stars: r.stars, comment: r.comment ?? null })),
  });
});
