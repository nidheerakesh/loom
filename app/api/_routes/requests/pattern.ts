import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireSession } from "../../_lib/auth.js";
import { requireCoordinator, requirePatternViewer } from "../../_lib/coordinator.js";

const BUCKET = "portfolio";

const AddBody = z.object({
  token: z.string().min(1),
  requestId: z.string().min(1),
  path: z.string().min(1),
  caption: z.string().optional(),
});

function publicUrl(storagePath: string): string {
  return supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

// POST adds a reference photo — coordinator only, mirroring requireCoordinator's rule that
// the pattern is hers (or the appointed provider's) to set. GET reads it back — anyone with a
// real reason to see this job (requirePatternViewer), not the coordinator alone, since the
// whole point is the team sees the same reference she does.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === "POST") {
    const { token, requestId, path, caption } = AddBody.parse(req.body);
    const s = await requireSession(token);
    await requireCoordinator(s, requestId);
    const { error } = await supabaseAdmin
      .from("request_patterns")
      .insert({ request_id: requestId, storage_id: path, caption });
    if (error) throw new HttpError(500, error.message);
    res.status(200).json(null);
    return;
  }

  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const requestId = typeof req.query.requestId === "string" ? req.query.requestId : undefined;
  if (!requestId) throw new HttpError(400, "requestId required");
  const s = await requireSession(token);
  await requirePatternViewer(s, requestId);

  const { data, error } = await supabaseAdmin
    .from("request_patterns")
    .select("id, storage_id, caption")
    .eq("request_id", requestId);
  if (error) throw new HttpError(500, error.message);
  res.status(200).json(
    (data ?? []).map((item) => ({
      _id: item.id,
      url: item.storage_id ? publicUrl(item.storage_id) : null,
      caption: item.caption,
    })),
  );
});
