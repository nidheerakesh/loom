import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireSession } from "../../_lib/auth.js";
import { requireCoordinator } from "../../_lib/coordinator.js";

const BUCKET = "portfolio";
const Body = z.object({ token: z.string().min(1), itemId: z.string().min(1) });

// Mirrors providers/portfolio/delete.ts exactly: storage removed before the row, so a failed
// storage call never leaves an orphaned pointer with nothing left to clean it up.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, itemId } = Body.parse(req.body);
  const s = await requireSession(token);

  const { data: item, error: findErr } = await supabaseAdmin
    .from("request_patterns")
    .select("id, request_id, storage_id")
    .eq("id", itemId)
    .maybeSingle();
  if (findErr) throw new HttpError(500, findErr.message);
  // 404 rather than 403 so an id cannot be probed for existence.
  if (!item) throw new HttpError(404, "Item not found");
  await requireCoordinator(s, item.request_id);

  if (item.storage_id) {
    const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove([item.storage_id]);
    if (rmErr) throw new HttpError(500, rmErr.message);
  }

  const { error: delErr } = await supabaseAdmin.from("request_patterns").delete().eq("id", item.id);
  if (delErr) throw new HttpError(500, delErr.message);

  res.status(200).json(null);
});
