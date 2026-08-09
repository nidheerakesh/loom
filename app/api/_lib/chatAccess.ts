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
    // Independent lookups, so issue them together rather than one after another.
    const [requestRes, interestsRes, teamsRes] = await Promise.all([
      supabaseAdmin.from("requests").select("customer_id").eq("id", thread.context_id).maybeSingle(),
      supabaseAdmin.from("interests").select("provider_id").eq("request_id", thread.context_id),
      supabaseAdmin.from("teams").select("id").eq("request_id", thread.context_id),
    ]);
    for (const r of [requestRes, interestsRes, teamsRes]) {
      if (r.error) throw new HttpError(500, r.error.message);
    }
    if (requestRes.data) p.customerIds.add(requestRes.data.customer_id);
    for (const i of interestsRes.data ?? []) p.providerIds.add(i.provider_id);

    // Anyone placed on a team for this request, fetched in one query rather than per team.
    const teamIds = (teamsRes.data ?? []).map((t) => t.id);
    if (teamIds.length > 0) {
      const { data: members, error: mErr } = await supabaseAdmin
        .from("team_members")
        .select("provider_id")
        .in("team_id", teamIds);
      if (mErr) throw new HttpError(500, mErr.message);
      for (const m of members ?? []) p.providerIds.add(m.provider_id);
    }
    return p;
  }

  if (thread.context_type === "team") {
    const [membersRes, teamRes] = await Promise.all([
      // Anyone who declined is not on this job, so they are not in its conversation either.
      supabaseAdmin
        .from("team_members")
        .select("provider_id")
        .eq("team_id", thread.context_id)
        .neq("state", "declined"),
      supabaseAdmin.from("teams").select("request_id").eq("id", thread.context_id).maybeSingle(),
    ]);
    if (membersRes.error) throw new HttpError(500, membersRes.error.message);
    if (teamRes.error) throw new HttpError(500, teamRes.error.message);
    for (const m of membersRes.data ?? []) p.providerIds.add(m.provider_id);

    // The customer whose request the team was assembled for belongs in it too.
    const team = teamRes.data;
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

// Threads the session may see.
//
// Batched deliberately. Testing each candidate with `canAccessThread` in a loop cost 3-5
// queries per thread over 200 candidates — several hundred round trips on a screen that
// polls every 7 seconds. This resolves the same membership with a fixed four queries,
// regardless of how many threads there are.
export async function visibleThreads(session: Session, limit = 50): Promise<ThreadRow[]> {
  if (session.role === "admin") {
    const { data, error } = await supabaseAdmin
      .from("chat_threads")
      .select("id, context_type, context_id, title")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new HttpError(500, error.message);
    return data ?? [];
  }

  const { data: threads, error } = await supabaseAdmin
    .from("chat_threads")
    .select("id, context_type, context_id, title")
    .order("created_at", { ascending: false })
    .limit(limit * 4);
  if (error) throw new HttpError(500, error.message);
  if (!threads || threads.length === 0) return [];

  const requestIds = new Set<string>();
  const teamIds = new Set<string>();
  for (const t of threads) {
    if (t.context_type === "request") requestIds.add(t.context_id);
    if (t.context_type === "team") teamIds.add(t.context_id);
  }

  const isProvider = session.role === "provider";

  // Everything the candidate threads could depend on, in one round of parallel queries.
  const [requestsRes, interestsRes, teamsRes, membersRes] = await Promise.all([
    requestIds.size
      ? supabaseAdmin.from("requests").select("id, customer_id").in("id", [...requestIds])
      : Promise.resolve({ data: [], error: null }),
    isProvider && requestIds.size
      ? supabaseAdmin
          .from("interests")
          .select("request_id")
          .eq("provider_id", session.userId)
          .in("request_id", [...requestIds])
      : Promise.resolve({ data: [], error: null }),
    // Teams belonging to a candidate request, plus the requests behind candidate team threads.
    requestIds.size || teamIds.size
      ? supabaseAdmin
          .from("teams")
          .select("id, request_id")
          .or(
            [
              requestIds.size ? `request_id.in.(${[...requestIds].join(",")})` : null,
              teamIds.size ? `id.in.(${[...teamIds].join(",")})` : null,
            ]
              .filter(Boolean)
              .join(","),
          )
      : Promise.resolve({ data: [], error: null }),
    isProvider
      ? supabaseAdmin
          .from("team_members")
          .select("team_id")
          .eq("provider_id", session.userId)
          .neq("state", "declined")
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [requestsRes, interestsRes, teamsRes, membersRes]) {
    if (r.error) throw new HttpError(500, r.error.message);
  }

  const customerOfRequest = new Map<string, string>();
  for (const r of (requestsRes.data ?? []) as { id: string; customer_id: string }[]) {
    customerOfRequest.set(r.id, r.customer_id);
  }
  const myInterestRequests = new Set(
    ((interestsRes.data ?? []) as { request_id: string }[]).map((i) => i.request_id),
  );
  const myTeams = new Set(((membersRes.data ?? []) as { team_id: string }[]).map((m) => m.team_id));

  const teamsOfRequest = new Map<string, string[]>();
  const requestOfTeam = new Map<string, string>();
  for (const t of (teamsRes.data ?? []) as { id: string; request_id: string }[]) {
    requestOfTeam.set(t.id, t.request_id);
    const list = teamsOfRequest.get(t.request_id) ?? [];
    list.push(t.id);
    teamsOfRequest.set(t.request_id, list);
  }

  const visible = (t: ThreadRow): boolean => {
    if (t.context_type === "provider") {
      const { providerId, customerId } = parseProviderContext(t.context_id);
      return isProvider ? providerId === session.userId : customerId === session.userId;
    }
    if (t.context_type === "request") {
      if (!isProvider) return customerOfRequest.get(t.context_id) === session.userId;
      if (myInterestRequests.has(t.context_id)) return true;
      return (teamsOfRequest.get(t.context_id) ?? []).some((id) => myTeams.has(id));
    }
    if (t.context_type === "team") {
      if (isProvider) return myTeams.has(t.context_id);
      const requestId = requestOfTeam.get(t.context_id);
      return !!requestId && customerOfRequest.get(requestId) === session.userId;
    }
    return t.context_id.split(":").includes(session.userId);
  };

  return threads.filter(visible).slice(0, limit);
}
