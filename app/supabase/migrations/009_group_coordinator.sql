-- Every group task now has one person accountable for it: by default the customer who posted
-- it, or someone she appoints (who may be a provider). The coordinator owns three things —
-- one agreed rate for the whole team, a shared reference photo, and a sign-off before the job
-- counts as finished.
--
-- Lives on `requests`, not `teams`, because only `requests` exists on both paths a group order
-- gets staffed by: the auto-assembly engine (which creates a `teams` row) and the open call
-- added this session (`requests/respond.ts` + `requests/select-team.ts`, which never does).
--
-- All six columns are nullable/inert on individual requests and on group requests that predate
-- this migration — coordinator_role defaults to 'customer', which is exactly the behaviour
-- today's requests/complete.ts already has (the customer alone decides the job is done).
alter table requests add column coordinator_role text not null default 'customer'
  check (coordinator_role in ('customer', 'provider'));
-- Set only when coordinator_role = 'provider'. Enforced in the route (set-coordinator.ts),
-- not a CHECK constraint here — a route can say "that provider doesn't exist", a constraint
-- violation can only say "insert failed".
alter table requests add column coordinator_provider_id uuid references providers (id);
alter table requests add column agreed_rate double precision;
alter table requests add column agreed_rate_unit text;
alter table requests add column coordinator_signed_off_at timestamptz;

-- Same shape as portfolio_items, keyed to the request instead of a provider — a shared
-- reference photo for what the finished work should look like, not a personal gallery.
create table request_patterns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid not null references requests (id) on delete cascade,
  -- Supabase Storage object path (bucket "portfolio", "patterns/" prefix — no second bucket
  -- for one new upload surface), not a foreign key.
  storage_id text,
  caption text
);
create index request_patterns_request_id_idx on request_patterns (request_id);

-- RLS is on for every other table (005_enable_rls_everywhere.sql) — a new table defaults to
-- none, and none means readable by anyone holding the public anon key.
alter table request_patterns enable row level security;
