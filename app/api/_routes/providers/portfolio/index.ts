import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../../_lib/http.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";
import { requireRole, sessionByToken } from "../../../_lib/auth.js";

const BUCKET = "portfolio";

const AddBody = z.object({
  token: z.string().min(1),
  path: z.string().min(1),
  caption: z.string().optional(),
});

function publicUrl(storagePath: string): string {
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === "POST") {
    const { token, path, caption } = AddBody.parse(req.body);
    const s = await requireRole(token, "provider");
    const { error } = await supabaseAdmin
      .from("portfolio_items")
      .insert({ provider_id: s.userId, storage_id: path, caption });
    if (error) throw new HttpError(500, error.message);
    res.status(200).json(null);
    return;
  }

  // GET — mirrors the old myPortfolio query's soft-auth (returns [] if not logged in
  // as a provider, rather than throwing) since it's read on every Profile render.
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const s = token ? await sessionByToken(token) : null;
  if (!s || s.role !== "provider") {
    res.status(200).json([]);
    return;
  }
  const { data, error } = await supabaseAdmin
    .from("portfolio_items")
    .select("id, storage_id, caption")
    .eq("provider_id", s.userId);
  if (error) throw new HttpError(500, error.message);
  res.status(200).json(
    (data ?? []).map((item) => ({
      _id: item.id,
      url: item.storage_id ? publicUrl(item.storage_id) : null,
      caption: item.caption,
    })),
  );
});
