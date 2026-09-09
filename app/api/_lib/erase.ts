import { HttpError } from "./http.js";
import { supabaseAdmin } from "./supabase.js";

const PORTFOLIO_BUCKET = "portfolio";

// Deletes a portfolio's stored image, but only after it is known there is no live row still
// pointing at it — see providers/portfolio/delete.ts, where this same order (storage, then
// row) exists so a failed storage call never leaves an orphaned pointer.
async function eraseProviderPortfolio(providerId: string): Promise<void> {
  const { data: items, error } = await supabaseAdmin
    .from("portfolio_items")
    .select("storage_id")
    .eq("provider_id", providerId);
  if (error) throw new HttpError(500, error.message);
  const paths = (items ?? []).map((i) => i.storage_id).filter((p): p is string => !!p);
  if (paths.length === 0) return;
  const { error: rmErr } = await supabaseAdmin.storage.from(PORTFOLIO_BUCKET).remove(paths);
  if (rmErr) throw new HttpError(500, rmErr.message);
}

// `matches` is an audit trail and deliberately has no cascade on provider_id or request_id —
// see schema.sql's comment on the table. That makes it the one thing standing between a
// provider or a request and a clean delete: Postgres refuses the delete outright rather than
// silently dropping audit rows. So it is cleared explicitly, here, before anything else.
async function eraseMatchesFor(column: "provider_id" | "request_id", ids: string[]): Promise<void> {
  // Guard against an empty array reaching `.in()` — supabaseAdmin is the service-role client,
  // and this codebase already learned once (accounts/delete's sibling routes) that an
  // unfiltered condition on it is not the same as "nothing to do".
  if (ids.length === 0) return;
  const { error } = await supabaseAdmin.from("matches").delete().in(column, ids);
  if (error) throw new HttpError(500, error.message);
}

// chat_threads.context_id is polymorphic text with no FK (see chatAccess.ts) — Postgres will
// not clean these up on its own when the provider/customer/request/team they refer to is
// deleted, and leaving them behind is not "harmless orphan", it is her past messages staying
// reachable by anyone who still has (or later gets) access to that context id. Deleting the
// thread cascades to `messages` (thread_id has ON DELETE CASCADE), so this is the one place
// that needs to run.
async function eraseThreadsByContext(contextType: string, contextIds: string[]): Promise<void> {
  if (contextIds.length === 0) return;
  const { error } = await supabaseAdmin
    .from("chat_threads")
    .delete()
    .eq("context_type", contextType)
    .in("context_id", contextIds);
  if (error) throw new HttpError(500, error.message);
}

async function eraseDirectAndProviderThreads(id: string): Promise<void> {
  // "provider" threads are keyed "<providerId>:<customerId>" (or, for pre-format rows, a bare
  // provider id — see chatAccess.ts's parseProviderContext); "direct" threads are keyed
  // "<idA>:<idB>". Both need a substring match rather than an exact one, which `.in()` can't
  // do, so these two go through `.or()` with `like` instead of the shared helper above.
  const { error } = await supabaseAdmin
    .from("chat_threads")
    .delete()
    .in("context_type", ["provider", "direct"])
    .or(`context_id.eq.${id},context_id.like.${id}:%,context_id.like.%:${id}`);
  if (error) throw new HttpError(500, error.message);
}

// Scrubs what deleting threads outright would miss: her own words sitting in a conversation
// that survives her, e.g. a team thread for a job she was one of several members on, or a
// request thread on somebody else's individual job she merely applied to. The thread and
// everyone else's messages in it stay; only the rows she authored go.
async function eraseMessagesBySender(senderId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("messages").delete().eq("sender_id", senderId);
  if (error) throw new HttpError(500, error.message);
}

async function eraseProvider(providerId: string): Promise<void> {
  await eraseProviderPortfolio(providerId);
  await eraseMessagesBySender(providerId);
  await eraseDirectAndProviderThreads(providerId);
  await eraseMatchesFor("provider_id", [providerId]);

  // Everything else cascades from the row itself: provider_skills, portfolio_items (rows;
  // storage already cleared above), interests, team_members, ratings where provider_id — all
  // declared `on delete cascade` against providers.id in schema.sql.
  const { error } = await supabaseAdmin.from("providers").delete().eq("id", providerId);
  if (error) throw new HttpError(500, error.message);
}

async function eraseCustomer(customerId: string): Promise<void> {
  const { data: requests, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id")
    .eq("customer_id", customerId);
  if (reqErr) throw new HttpError(500, reqErr.message);
  const requestIds = (requests ?? []).map((r) => r.id);

  let teamIds: string[] = [];
  if (requestIds.length > 0) {
    const { data: teams, error: teamErr } = await supabaseAdmin
      .from("teams")
      .select("id")
      .in("request_id", requestIds);
    if (teamErr) throw new HttpError(500, teamErr.message);
    teamIds = (teams ?? []).map((t) => t.id);
  }

  await eraseMessagesBySender(customerId);
  await eraseDirectAndProviderThreads(customerId);
  await eraseThreadsByContext("request", requestIds);
  await eraseThreadsByContext("team", teamIds);
  await eraseMatchesFor("request_id", requestIds);

  // Cascades from here: requests -> request_skills, interests, teams -> team_members (all
  // `on delete cascade`); ratings where customer_id.
  const { error } = await supabaseAdmin.from("customers").delete().eq("id", customerId);
  if (error) throw new HttpError(500, error.message);
}

// Erases a phone number entirely — both roles if she holds both, not just the one she is
// signed in as. A woman who stitches for a living and also hires a caterer should not be able
// to delete "half" of herself and leave the other half findable.
export async function erasePhone(phoneHash: string): Promise<void> {
  const [provRes, custRes] = await Promise.all([
    supabaseAdmin.from("providers").select("id").eq("phone_hash", phoneHash).maybeSingle(),
    supabaseAdmin.from("customers").select("id").eq("phone_hash", phoneHash).maybeSingle(),
  ]);
  if (provRes.error) throw new HttpError(500, provRes.error.message);
  if (custRes.error) throw new HttpError(500, custRes.error.message);

  if (provRes.data) await eraseProvider(provRes.data.id);
  if (custRes.data) await eraseCustomer(custRes.data.id);

  const [otpsRes, sessionsRes, consentsRes] = await Promise.all([
    supabaseAdmin.from("otps").delete().eq("phone_hash", phoneHash),
    supabaseAdmin.from("sessions").delete().eq("phone_hash", phoneHash),
    supabaseAdmin.from("consents").delete().eq("phone_hash", phoneHash),
  ]);
  if (otpsRes.error) throw new HttpError(500, otpsRes.error.message);
  if (sessionsRes.error) throw new HttpError(500, sessionsRes.error.message);
  if (consentsRes.error) throw new HttpError(500, consentsRes.error.message);
}
