import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../_lib/http";
import { supabaseAdmin } from "../_lib/supabase";
import { requireSession, sessionByToken } from "../_lib/auth";

const SendBody = z.object({ token: z.string().min(1), threadId: z.string().min(1), body: z.string() });

// Ported from convex/chat.ts's `send` (POST) + `listMessages` (GET). Writes go through this
// server route (service-role key); the browser-side Supabase Realtime client in
// Communities.tsx only ever subscribes to `postgres_changes`, never writes directly.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === "POST") {
    const { token, threadId, body } = SendBody.parse(req.body);
    const s = await requireSession(token);
    if (!body.trim()) {
      res.status(200).json(null);
      return;
    }
    const { error } = await supabaseAdmin
      .from("messages")
      .insert({ thread_id: threadId, sender_id: s.userId, sender_role: s.role, body: body.trim() });
    if (error) throw new HttpError(500, error.message);
    res.status(200).json(null);
    return;
  }

  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const threadId = typeof req.query.threadId === "string" ? req.query.threadId : undefined;
  if (!threadId) throw new HttpError(400, "threadId required");
  const s = token ? await sessionByToken(token) : null;
  if (!s) {
    res.status(200).json([]);
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("messages")
    .select("id, body, sender_id, sender_role")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new HttpError(500, error.message);

  res.status(200).json(
    (data ?? []).map((m) => ({
      _id: m.id,
      body: m.body,
      senderId: m.sender_id,
      senderRole: m.sender_role,
      mine: m.sender_id === s.userId,
    })),
  );
});
