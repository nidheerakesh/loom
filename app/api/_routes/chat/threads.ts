import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import type { Session } from "../../_lib/auth.js";
import { requireSession, sessionByToken } from "../../_lib/auth.js";
import type { ThreadRow } from "../../_lib/chatAccess.js";
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

  const titleFor = await counterpartyTitles(session, threads);

  res.status(200).json(
    threads.map((t) => ({
      _id: t.id,
      title: titleFor.get(t.id) ?? t.title,
      lastMessage: lastByThread.get(t.id) ?? null,
    })),
  );
});

// A one-to-one thread's stored title is written once, by whoever opened it — the provider's
// name, because a customer starts the conversation from that provider's profile. It is
// therefore right for exactly one of the two people in it: the provider opened her own
// conversations and saw her own name at the top of every one.
//
// The name a conversation should carry is the name of the person on the other end, which
// depends on who is reading. So it is resolved per viewer here rather than stored.
//
// Only one-to-one `provider` threads are relabelled. A group conversation was given a real
// title by the customer who created it ("Onam bulk order"), a team thread is named after its
// job, and both of those mean the same thing to everyone reading them.
async function counterpartyTitles(
  session: Session,
  threads: ThreadRow[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const oneToOne = threads.filter((t) => t.context_type === "provider");
  if (oneToOne.length === 0) return out;

  const parsed = oneToOne.map((t) => {
    const [providerId, customerId] = t.context_id.split(":");
    return { threadId: t.id, providerId, customerId: customerId || undefined };
  });

  // One query per side, not one per thread — this list polls every 7 seconds.
  const isProvider = session.role === "provider";
  const names = new Map<string, string>();
  if (isProvider) {
    const ids = [...new Set(parsed.map((p) => p.customerId).filter(Boolean) as string[])];
    if (ids.length > 0) {
      const { data, error } = await supabaseAdmin.from("customers").select("id, name").in("id", ids);
      if (error) throw new HttpError(500, error.message);
      for (const c of data ?? []) names.set(c.id, c.name);
    }
  } else {
    const ids = [...new Set(parsed.map((p) => p.providerId).filter(Boolean))];
    if (ids.length > 0) {
      const { data, error } = await supabaseAdmin
        .from("providers")
        .select("id, name, shop_name")
        .in("id", ids);
      if (error) throw new HttpError(500, error.message);
      for (const p of data ?? []) names.set(p.id, p.shop_name ?? p.name);
    }
  }

  for (const p of parsed) {
    const otherId = isProvider ? p.customerId : p.providerId;
    const name = otherId ? names.get(otherId) : undefined;
    if (name) out.set(p.threadId, name);
  }
  return out;
}
