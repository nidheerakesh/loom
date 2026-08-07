import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../../_lib/http.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";
import { requireRole } from "../../../_lib/auth.js";

const BUCKET = "portfolio";

const Body = z.object({ token: z.string().min(1), itemId: z.string().min(1) });

// Remove one portfolio item: the stored image and its row.
//
// POST rather than DELETE because scripts/dev-api-server.ts only parses a request body for
// POST, and local dev needs to exercise the same handler production does.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, itemId } = Body.parse(req.body);
  const s = await requireRole(token, "provider");

  const { data: item, error: findErr } = await supabaseAdmin
    .from("portfolio_items")
    .select("id, provider_id, storage_id")
    .eq("id", itemId)
    .maybeSingle();
  if (findErr) throw new HttpError(500, findErr.message);

  // Ownership is checked before anything is removed — without it any provider could delete
  // another's work by id. 404 rather than 403 so an id cannot be probed for existence.
  if (!item || item.provider_id !== s.userId) throw new HttpError(404, "Item not found");

  // Storage first: if this fails we still hold the row, so the image is not orphaned with
  // nothing pointing at it. Deleting the row first would leak the object permanently.
  if (item.storage_id) {
    const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove([item.storage_id]);
    if (rmErr) throw new HttpError(500, rmErr.message);
  }

  const { error: delErr } = await supabaseAdmin.from("portfolio_items").delete().eq("id", item.id);
  if (delErr) throw new HttpError(500, delErr.message);

  res.status(200).json(null);
});
