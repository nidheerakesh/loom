import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireSession } from "../../_lib/auth.js";
import { requireThreadAccess } from "../../_lib/chatAccess.js";

const Body = z.object({ token: z.string().min(1), threadId: z.string().min(1), fileName: z.string().min(1) });
// Same bucket pattern-upload-url.ts and providers/portfolio/upload-url.ts already use — a
// "chat/" prefix is all a third upload surface needs, not a third bucket.
const BUCKET = "portfolio";

// Any thread participant may attach a photo, unlike the pattern photo (coordinator-only) —
// a group chat is a conversation, not a place only one person posts to.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, threadId, fileName } = Body.parse(req.body);
  const s = await requireSession(token);
  await requireThreadAccess(s, threadId);

  const path = `chat/${threadId}/${randomUUID()}-${fileName}`;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new HttpError(500, error?.message ?? "Could not create upload URL");

  res.status(200).json({ signedUrl: data.signedUrl, path: data.path });
});
