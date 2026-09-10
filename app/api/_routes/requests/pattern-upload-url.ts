import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireSession } from "../../_lib/auth.js";
import { requireCoordinator } from "../../_lib/coordinator.js";

const Body = z.object({ token: z.string().min(1), requestId: z.string().min(1), fileName: z.string().min(1) });
// Same bucket providers/portfolio/*.ts already uses — a "patterns/" prefix keeps this new
// upload surface out of a provider's own portfolio path without needing a second bucket.
const BUCKET = "portfolio";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId, fileName } = Body.parse(req.body);
  const s = await requireSession(token);
  await requireCoordinator(s, requestId);

  const path = `patterns/${requestId}/${randomUUID()}-${fileName}`;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new HttpError(500, error?.message ?? "Could not create upload URL");

  res.status(200).json({ signedUrl: data.signedUrl, path: data.path });
});
