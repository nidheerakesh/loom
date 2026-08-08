import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireSession, sessionByToken } from "../../_lib/auth.js";
import { canAccessThread, providerChatContextId, visibleThreads } from "../../_lib/chatAccess.js";

const OpenBody = z.object({
  token: z.string().min(1),
  contextType: z.enum(["provider", "request", "team", "direct"]),
  contextId: z.string().min(1),
  title: z.string().min(1),
});

// Community chat. Human-to-human, entirely OUTSIDE the match decision.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method === "POST") {
    const { token, contextType, contextId, title } = OpenBody.parse(req.body);
    const session = await requireSession(token);

    // A provider chat is one-to-one, so the thread key has to name both sides. Keyed on the
    // provider alone (as it once was) every customer contacting the same provider was handed
    // the same thread, and read everyone else's conversation with them.
    let key = contextId;
    if (contextType === "provider") {
      if (session.role !== "customer") {
        throw new HttpError(403, "Only a customer can open a chat with a provider");
      }
      key = providerChatContextId(contextId, session.userId);
    }

    const { data: existing, error: findErr } = await supabaseAdmin
      .from("chat_threads")
      .select("id, context_type, context_id, title")
      .eq("context_type", contextType)
      .eq("context_id", key)
      .maybeSingle();
    if (findErr) throw new HttpError(500, findErr.message);
    if (existing) {
      // Reusing a thread is still a read of it.
      if (!(await canAccessThread(session, existing))) throw new HttpError(404, "Thread not found");
      res.status(200).json(existing.id);
      return;
    }

    const { data: created, error: insErr } = await supabaseAdmin
      .from("chat_threads")
      .insert({ context_type: contextType, context_id: key, title })
      .select("id, context_type, context_id, title")
      .single();
    if (insErr) throw new HttpError(500, insErr.message);

    // Guards against opening a thread on someone else's request or team.
    if (!(await canAccessThread(session, created))) {
      // Rollback of a thread the caller turned out not to be part of; if the delete fails
      // the orphan is worth surfacing rather than leaving silently behind.
      const { error: rollbackErr } = await supabaseAdmin.from("chat_threads").delete().eq("id", created.id);
      if (rollbackErr) throw new HttpError(500, rollbackErr.message);
      throw new HttpError(403, "You are not part of that conversation");
    }
    res.status(200).json(created.id);
    return;
  }

  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const session = token ? await sessionByToken(token) : null;
  if (!session) {
    res.status(200).json([]);
    return;
  }

  // Only threads this user is part of. Previously every signed-in user received the 50 most
  // recent threads in the system, each with its last message.
  const threads = await visibleThreads(session);
  if (threads.length === 0) {
    res.status(200).json([]);
    return;
  }

  // One query for every thread's latest message, reduced in JS — this was a query per thread
  // on a screen that polls every 7 seconds.
  const { data: recent, error: recentErr } = await supabaseAdmin
    .from("messages")
    .select("thread_id, body, created_at")
    .in(
      "thread_id",
      threads.map((t) => t.id),
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (recentErr) throw new HttpError(500, recentErr.message);

  const lastByThread = new Map<string, string>();
  for (const m of recent ?? []) {
    // Rows arrive newest-first, so the first one seen per thread is the latest.
    if (!lastByThread.has(m.thread_id)) lastByThread.set(m.thread_id, m.body);
  }

  res.status(200).json(
    threads.map((t) => ({
      _id: t.id,
      title: t.title,
      lastMessage: lastByThread.get(t.id) ?? null,
    })),
  );
});
