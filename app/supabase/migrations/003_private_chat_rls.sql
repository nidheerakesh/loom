-- Chat was world-readable. `chat_threads` and `messages` each carried a
-- `for select using (true)` policy so that a browser-side Supabase client could receive
-- Realtime updates. That client authenticates with the anon key, which ships inside the
-- public JS bundle — so anyone who opened devtools, or simply fetched the bundle, could read
-- every conversation in the application straight from PostgREST:
--
--   curl "$SUPABASE_URL/rest/v1/messages?select=body" -H "apikey: <anon key from bundle>"
--
-- RLS cannot express "only participants" here, because this app does not use Supabase Auth:
-- to Postgres every browser caller is the same anonymous role, so there is no identity to
-- filter on. The fix is therefore to let no anonymous read through at all. Reads now go via
-- /api/chat/*, which runs with the service-role key (RLS does not apply to it) and checks
-- participation against the `sessions` table.
--
-- The browser-side client has been deleted, so nothing depends on these policies any more;
-- the app polls /api/chat/messages instead of subscribing.
--
-- NOT APPLIED AUTOMATICALLY: this needs Postgres credentials (the service role key is a
-- PostgREST key, not a DB password). Run it from the Supabase SQL Editor, or:
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/003_private_chat_rls.sql
--
-- UNTIL THIS RUNS, EVERY CHAT MESSAGE REMAINS PUBLICLY READABLE.

drop policy if exists chat_threads_public_read on chat_threads;
drop policy if exists messages_public_read on messages;

-- RLS stays enabled on both tables. With no permissive policy remaining, anon and
-- authenticated roles can read nothing; the service-role key used by api/_lib/supabase.ts
-- bypasses RLS and is unaffected.

-- Realtime is no longer used for chat, so `messages` does not need to be published.
-- Dropping it also stops the row payloads being broadcast to anonymous subscribers.
alter publication supabase_realtime drop table messages;

-- After running this, rotate the anon/publishable key in the Supabase dashboard: the old one
-- was public and could read this data for as long as the policies above existed.
