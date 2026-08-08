-- CRITICAL. Run this before anything else in this directory.
--
-- Only `chat_threads` and `messages` ever had row level security enabled. The other 22 tables
-- had none — and the schema comment recorded the reason as "server-only (no RLS policies,
-- service role bypasses RLS anyway)". That reasoning is inverted. In Supabase, PostgREST
-- exposes every table in the `public` schema and the `anon` role holds SELECT on them, so a
-- table WITHOUT RLS enabled is readable by anyone holding the publishable key — which ships
-- inside the JS bundle. "No policies" means wide open, not locked down. Policies only ever
-- ADD access to a table that has RLS switched on.
--
-- Verified against production with nothing but the public key:
--
--   curl "$SUPABASE_URL/rest/v1/sessions?select=*" -H "apikey: <key from the JS bundle>"
--   -> [{"token":"msecar8t-...","role":"provider","user_id":"ca95ee58-..."}]
--
-- `sessions.token` is the credential api/_lib/auth.ts authenticates with (sessionByToken does
-- `.eq("token", token)`), so anyone could read a live token and act as that user. `providers`,
-- `customers`, `requests`, `interests`, `ratings` and `portfolio_items` were equally readable,
-- phone hashes included.
--
-- Enabling RLS with NO policy denies anon and authenticated entirely. The service-role key
-- used by api/_lib/supabase.ts bypasses RLS, so every API route keeps working untouched — the
-- application only ever reaches the database through that key.
--
-- NOT APPLIED AUTOMATICALLY: needs Postgres credentials (the service role key is a PostgREST
-- key, not a DB password). Supabase dashboard -> SQL Editor -> paste -> Run. Or:
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/005_enable_rls_everywhere.sql

alter table otps              enable row level security;
alter table sessions          enable row level security;
alter table cds               enable row level security;
alter table groups            enable row level security;
alter table locations         enable row level security;
alter table near_distances    enable row level security;
alter table skills            enable row level security;
alter table skill_aliases     enable row level security;
alter table skill_candidates  enable row level security;
alter table providers         enable row level security;
alter table provider_skills   enable row level security;
alter table portfolio_items   enable row level security;
alter table customers         enable row level security;
alter table requests          enable row level security;
alter table request_skills    enable row level security;
alter table interests         enable row level security;
alter table matches           enable row level security;
alter table teams             enable row level security;
alter table team_members      enable row level security;
alter table narrations        enable row level security;
alter table ratings           enable row level security;
alter table grievances        enable row level security;

-- chat_threads and messages already have RLS on; 003 removes their permissive read policies.

-- Verify afterwards — every one of these must come back empty or 401, never with rows:
--   curl "$SUPABASE_URL/rest/v1/sessions?select=*&limit=1"  -H "apikey: $VITE_SUPABASE_ANON_KEY"
--   curl "$SUPABASE_URL/rest/v1/providers?select=*&limit=1" -H "apikey: $VITE_SUPABASE_ANON_KEY"
--
-- Then rotate the publishable/anon key in the dashboard: the old one was public for as long
-- as these tables were exposed.
