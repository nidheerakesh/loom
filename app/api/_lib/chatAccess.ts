import { HttpError } from "./http.js";
import { supabaseAdmin } from "./supabase.js";
import type { Session } from "./auth.js";

// Who may read and write a chat thread.
//
// There is no participants table, and adding one needs DDL we cannot run here, so membership
// is derived from the thread's context instead. Every rule below resolves to a set of
// provider ids and customer ids, and the caller must be in it.
//
// Threads used to be readable by anyone signed in — `chat/threads` listed all of them and
// `chat/messages` served any thread to any caller — so this is the check that makes a
// conversation private rather than merely unlisted.

export type ThreadRow = { id: string; context_type: string; context_id: string; title: string };

type Participants = { providerIds: Set<string>; customerIds: Set<string> };

const empty = (): Participants => ({ providerIds: new Set(), customerIds: new Set() });

// A one-to-one provider chat is keyed "<providerId>:<customerId>". Threads created before
// that format existed carry a bare provider id, which made every customer contacting the same
// provider share one thread — those are treated as provider-only so the old conversations
// stop being visible to customers who merely happened to message the same person.
function parseProviderContext(contextId: string): { providerId: string; customerId?: string } {
  const [providerId, customerId] = contextId.split(":");
  return { providerId, customerId: customerId || undefined };
}

export function providerChatContextId(providerId: string, customerId: string): string {
  return `${providerId}:${customerId}`;
}

async function participantsOf(thread: ThreadRow): Promise<Participants> {
  const p = empty();

  if (thread.context_type === "provider") {
    const { providerId, customerId } = parseProviderContext(thread.context_id);
    if (providerId) p.providerIds.add(providerId);
    if (customerId) p.customerIds.add(customerId);
    return p;
  }

  if (thread.context_type === "request") {
    const { data: request, error } = await supabaseAdmin
      .from("requests")
      .select("customer_id")
      .eq("id", thread.context_id)
      .maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (request) p.customerIds.add(request.customer_id);

    // Providers who put their hand up for this request, plus anyone placed on its team.
    const { data: interests, error: iErr } = await supabaseAdmin
      .from("interests")
      .select("provider_id")
      .eq("request_id", thread.context_id);
    if (iErr) throw new HttpError(500, iErr.message);
    for (const i of interests ?? []) p.providerIds.add(i.provider_id);

    const { data: teams, error: tErr } = await supabaseAdmin
      .from("teams")
      .select("id")
      .eq("request_id", thread.context_id);
    if (tErr) throw new HttpError(500, tErr.message);
    for (const team of teams ?? []) {
      const { data: members, error: mErr } = await supabaseAdmin
        .from("team_members")
        .select("provider_id")
        .eq("team_id", team.id);
      if (mErr) throw new HttpError(500, mErr.message);
      for (const m of members ?? []) p.providerIds.add(m.provider_id);
    }
    return p;
  }

  if (thread.context_type === "team") {
    const { data: members, error } = await supabaseAdmin
      .from("team_members")
      .select("provider_id")
      .eq("team_id", thread.context_id);
    if (error) throw new HttpError(500, error.message);
    for (const m of members ?? []) p.providerIds.add(m.provider_id);

    // The customer whose request the team was assembled for belongs in it too.
    const { data: team, error: tErr } = await supabaseAdmin
      .from("teams")
      .select("request_id")
      .eq("id", thread.context_id)
      .maybeSingle();
    if (tErr) throw new HttpError(500, tErr.message);
    if (team) {
      const { data: request, error: rErr } = await supabaseAdmin
        .from("requests")
        .select("customer_id")
        .eq("id", team.request_id)
        .maybeSingle();
      if (rErr) throw new HttpError(500, rErr.message);
      if (request) p.customerIds.add(request.customer_id);
    }
    return p;
  }

  // "direct" threads are keyed by the two ids they join.
  for (const id of thread.context_id.split(":")) {
    if (!id) continue;
    p.providerIds.add(id);
    p.customerIds.add(id);
  }
  return p;
}

export async function canAccessThread(session: Session, thread: ThreadRow): Promise<boolean> {
  if (session.role === "admin") return true;
  const p = await participantsOf(thread);
  return session.role === "provider"
    ? p.providerIds.has(session.userId)
    : p.customerIds.has(session.userId);
}

export async function requireThreadAccess(session: Session, threadId: string): Promise<ThreadRow> {
  const { data: thread, error } = await supabaseAdmin
    .from("chat_threads")
    .select("id, context_type, context_id, title")
    .eq("id", threadId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  // 404 rather than 403 — a caller who is not a participant should not be able to confirm
  // that a given thread id exists at all.
  if (!thread || !(await canAccessThread(session, thread))) {
    throw new HttpError(404, "Thread not found");
  }
  return thread;
}

// Threads the session may see, filtered from the most recent candidates.
export async function visibleThreads(session: Session, limit = 50): Promise<ThreadRow[]> {
  const { data: threads, error } = await supabaseAdmin
    .from("chat_threads")
    .select("id, context_type, context_id, title")
    .order("created_at", { ascending: false })
    .limit(limit * 4);
  if (error) throw new HttpError(500, error.message);

  const out: ThreadRow[] = [];
  for (const thread of threads ?? []) {
    if (out.length >= limit) break;
    if (await canAccessThread(session, thread)) out.push(thread);
  }
  return out;
}
