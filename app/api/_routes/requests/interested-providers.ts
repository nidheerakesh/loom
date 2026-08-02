import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const requestId = typeof req.query.requestId === "string" ? req.query.requestId : undefined;
  if (!requestId) throw new HttpError(400, "requestId required");
  await requireRole(token, "customer");

  const { data: interests, error } = await supabaseAdmin
    .from("interests")
    .select("state, providers(id, name, shop_name, rating)")
    .eq("request_id", requestId);
  if (error) throw new HttpError(500, error.message);

  res.status(200).json(
    (interests ?? [])
      .map((i) => {
        const p = i.providers as unknown as { id: string; name: string; shop_name: string | null; rating: number } | null;
        if (!p) return null;
        return { providerId: p.id, name: p.name, shopName: p.shop_name ?? null, rating: p.rating, state: i.state };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  );
});
