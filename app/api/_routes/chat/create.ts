import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";
import { canAccessThread, providerChatContextId } from "../../_lib/chatAccess.js";

const Body = z.object({
  token: z.string().min(1),
  providerIds: z.array(z.string().min(1)).min(1).max(20),
  title: z.string().trim().min(1).max(80),
});

// A customer starts a conversation with people they choose, rather than only being able to
// message one provider at a time from that provider's profile.
//
// One provider reuses the existing one-to-one thread for that pair, so opening a chat here
// and from the provider's profile lands in the same conversation instead of quietly creating
// a second one. Several providers create a group thread keyed by all its participants, which
// is what chatAccess uses to decide who may read it.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, providerIds, title } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  const unique = [...new Set(providerIds)];

  // Guards against being added to a conversation with someone who does not exist — and, since
  // participation is derived from the thread key, against inventing a participant.
  const { data: found, error: provErr } = await supabaseAdmin
    .from("providers")
    .select("id")
    .in("id", unique);
  if (provErr) throw new HttpError(500, provErr.message);
  if ((found?.length ?? 0) !== unique.length) {
    throw new HttpError(400, "One of those providers no longer exists");
  }

  const isDirect = unique.length === 1;
  const contextType = isDirect ? "provider" : "direct";
  // Sorted so the same set of people always produces the same key, whatever order they were
  // picked in — otherwise re-creating the same group would make a second thread.
  const contextId = isDirect
    ? providerChatContextId(unique[0], s.userId)
    : [s.userId, ...unique].sort().join(":");

  const { data: existing, error: findErr } = await supabaseAdmin
    .from("chat_threads")
    .select("id, context_type, context_id, title")
    .eq("context_type", contextType)
    .eq("context_id", contextId)
    .maybeSingle();
  if (findErr) throw new HttpError(500, findErr.message);
  if (existing) {
    if (!(await canAccessThread(s, existing))) throw new HttpError(404, "Thread not found");
    res.status(200).json(existing.id);
    return;
  }

  const { data: created, error: insErr } = await supabaseAdmin
    .from("chat_threads")
    .insert({ context_type: contextType, context_id: contextId, title })
    .select("id, context_type, context_id, title")
    .single();
  if (insErr) throw new HttpError(500, insErr.message);

  // Belt and braces: the creator must end up able to read what they just made.
  if (!(await canAccessThread(s, created))) {
    await supabaseAdmin.from("chat_threads").delete().eq("id", created.id);
    throw new HttpError(500, "Could not create that conversation");
  }

  res.status(200).json(created.id);
});
