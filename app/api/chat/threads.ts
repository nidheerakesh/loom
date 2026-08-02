import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../_lib/http";
import { supabaseAdmin } from "../_lib/supabase";
import { requireSession, sessionByToken } from "../_lib/auth";

const OpenBody = z.object({
  token: z.string().min(1),
  contextType: z.enum(["provider", "request", "team", "direct"]),
  contextId: z.string().min(1),
  title: z.string().min(1),
});

// Community chat. Human-to-human, entirely OUTSIDE the match decision.
// Ported from convex/chat.ts's `openThread` (POST) + `listThreads` (GET).
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === "POST") {
    const { token, contextType, contextId, title } = OpenBody.parse(req.body);
    await requireSession(token);

    const { data: existing, error: findErr } = await supabaseAdmin
      .from("chat_threads")
      .select("id")
      .eq("context_type", contextType)
      .eq("context_id", contextId)
      .maybeSingle();
    if (findErr) throw new HttpError(500, findErr.message);
    if (existing) {
      res.status(200).json(existing.id);
      return;
    }
    const { data: created, error: insErr } = await supabaseAdmin
      .from("chat_threads")
      .insert({ context_type: contextType, context_id: contextId, title })
      .select("id")
      .single();
    if (insErr) throw new HttpError(500, insErr.message);
    res.status(200).json(created.id);
    return;
  }

  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const s = token ? await sessionByToken(token) : null;
  if (!s) {
    res.status(200).json([]);
    return;
  }
  const { data: threads, error } = await supabaseAdmin
    .from("chat_threads")
    .select("id, title")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new HttpError(500, error.message);

  const out = [];
  for (const t of threads ?? []) {
    const { data: last, error: lastErr } = await supabaseAdmin
      .from("messages")
      .select("body")
      .eq("thread_id", t.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastErr) throw new HttpError(500, lastErr.message);
    out.push({ _id: t.id, title: t.title, lastMessage: last?.body ?? null });
  }
  res.status(200).json(out);
});
