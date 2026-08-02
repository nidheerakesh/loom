import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { withHandler, HttpError } from "../../../_lib/http.js";
import { supabaseAdmin } from "../../../_lib/supabase.js";
import { requireRole } from "../../../_lib/auth.js";

const Body = z.object({ token: z.string().min(1), fileName: z.string().min(1) });
const BUCKET = "portfolio";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, fileName } = Body.parse(req.body);
  const s = await requireRole(token, "provider");

  const path = `${s.userId}/${randomUUID()}-${fileName}`;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new HttpError(500, error?.message ?? "Could not create upload URL");

  res.status(200).json({ signedUrl: data.signedUrl, path: data.path });
});
