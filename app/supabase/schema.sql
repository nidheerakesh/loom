-- Loom — Postgres schema (Supabase), ported from convex/schema.ts.
-- Run once in the Supabase SQL Editor (or `psql "$SUPABASE_DB_URL" -f supabase/schema.sql`)
-- against a fresh project. Mirrors the Convex table set field-for-field; see
-- convex/schema.ts for the source of truth this was derived from.

-- ---------------------------------------------------------------------------
-- Enums (Convex v.union(v.literal(...)) unions, reused across tables that
-- share the same union rather than redefined per table)
-- ---------------------------------------------------------------------------

create type role_enum as enum ('provider', 'customer', 'admin');
create type alias_source_enum as enum ('curated', 'approved');
create type skill_candidate_status_enum as enum ('pending', 'approved', 'rejected');
create type request_mode_enum as enum ('individual', 'group');
create type request_status_enum as enum ('open', 'assembling', 'assigned', 'completed');
create type interest_state_enum as enum ('interested', 'accepted', 'declined');
create type match_type_enum as enum ('individual', 'team');
create type team_status_enum as enum ('proposed', 'confirmed');
create type team_member_state_enum as enum ('invited', 'accepted', 'declined');
create type grievance_status_enum as enum ('open', 'reviewing', 'resolved');
create type chat_context_type_enum as enum ('provider', 'request', 'team', 'direct');

-- ---------------------------------------------------------------------------
-- Auth (custom phone-OTP + bearer-token sessions — NOT Supabase Auth)
-- ---------------------------------------------------------------------------

create table otps (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- unique, not just indexed: request-otp.ts upserts on this column so concurrent
  -- requests for the same number can't race into two rows (see api/auth/request-otp.ts).
  phone_hash text not null unique,
  code_hash text not null,
  role role_enum not null,
  expires_at timestamptz not null
);
create index otps_phone_hash_idx on otps (phone_hash);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  token text not null unique,
  role role_enum not null,
  -- Polymorphic: providers.id, customers.id, or the literal 'admin'. Stays
  -- text (not uuid) on purpose — do not tighten this to a foreign key.
  user_id text not null,
  phone_hash text not null
);
create index sessions_token_idx on sessions (token);

-- ---------------------------------------------------------------------------
-- Cluster / geography
-- ---------------------------------------------------------------------------

create table cds (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  panchayat text not null
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  cds_id uuid not null references cds (id) on delete cascade
);
create index groups_cds_id_idx on groups (cds_id);

create table locations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  label text not null
);

create table near_distances (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  from_location_id uuid not null references locations (id) on delete cascade,
  to_location_id uuid not null references locations (id) on delete cascade,
  distance_km double precision not null
);
create index near_distances_from_location_id_idx on near_distances (from_location_id);

-- ---------------------------------------------------------------------------
-- Skills + canonicalization (synonym merge)
-- ---------------------------------------------------------------------------

create table skills (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  canonical_name text not null,
  canonical_name_ml text,
  icon_key text not null
);
create index skills_canonical_name_idx on skills (canonical_name);

create table skill_aliases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  skill_id uuid not null references skills (id) on delete cascade,
  alias_text text not null, -- normalized: lowercase, trimmed
  source alias_source_enum not null
);
create index skill_aliases_alias_text_idx on skill_aliases (alias_text);
create index skill_aliases_skill_id_idx on skill_aliases (skill_id);

-- Defined for schema parity with convex/schema.ts; unused by any current
-- function (dead table there too — kept only so a future feature has it).
create table skill_candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  raw_text text not null,
  nearest_skill_id uuid references skills (id) on delete set null,
  similarity double precision not null,
  status skill_candidate_status_enum not null
);

-- ---------------------------------------------------------------------------
-- Providers (the "skilled" side)
-- ---------------------------------------------------------------------------

create table providers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Creation-ordered tiebreak, mirrors team_members.seq — Postgres uuid v4 is random,
  -- Convex's _id was creation-ordered; ties in teamAssembly's candidate sort and
  -- providers.search ranking need this instead of `id asc`.
  seq bigserial not null,
  name text not null,
  shop_name text,
  phone_hash text not null,
  available boolean not null,
  capacity integer not null, -- 1 = solo, >1 = shop
  rate double precision,
  rate_unit text, -- e.g. "piece", "day"
  delivery_days integer,
  experience_years integer not null,
  rating double precision not null, -- aggregate 0-5 (display-first)
  rating_count integer not null,
  languages text[] not null,
  home_location_id uuid not null references locations (id),
  group_id uuid references groups (id) on delete set null
);
create index providers_phone_hash_idx on providers (phone_hash);
create index providers_group_id_idx on providers (group_id);

create table provider_skills (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_id uuid not null references providers (id) on delete cascade,
  skill_id uuid not null references skills (id) on delete cascade,
  proficiency integer not null, -- graded 1-5
  rate double precision -- optional per-skill rate override
);
create index provider_skills_provider_id_idx on provider_skills (provider_id);
create index provider_skills_skill_id_idx on provider_skills (skill_id);

create table portfolio_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_id uuid not null references providers (id) on delete cascade,
  -- Supabase Storage object path (bucket "portfolio"), not a foreign key —
  -- Storage objects aren't a queryable Postgres table.
  storage_id text,
  caption text
);
create index portfolio_items_provider_id_idx on portfolio_items (provider_id);

-- ---------------------------------------------------------------------------
-- Customers (demand side; absorbs coordinator)
-- ---------------------------------------------------------------------------

create table customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  company text,
  phone_hash text not null,
  location_id uuid not null references locations (id)
);
create index customers_phone_hash_idx on customers (phone_hash);

-- ---------------------------------------------------------------------------
-- Requests (demand)
-- ---------------------------------------------------------------------------

create table requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  description text not null,
  mode request_mode_enum not null,
  units integer not null,
  pay double precision,
  deadline text,
  location_id uuid not null references locations (id),
  status request_status_enum not null,
  customer_id uuid not null references customers (id) on delete cascade
);
create index requests_customer_id_idx on requests (customer_id);
create index requests_status_idx on requests (status);

create table request_skills (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid not null references requests (id) on delete cascade,
  skill_id uuid not null references skills (id) on delete cascade,
  quantity integer not null
);
create index request_skills_request_id_idx on request_skills (request_id);
create index request_skills_skill_id_idx on request_skills (skill_id);

create table interests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_id uuid not null references providers (id) on delete cascade,
  request_id uuid not null references requests (id) on delete cascade,
  state interest_state_enum not null
);
create index interests_request_id_idx on interests (request_id);
create index interests_provider_id_idx on interests (provider_id);

-- ---------------------------------------------------------------------------
-- Matching audit + teams
-- ---------------------------------------------------------------------------

create table matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type match_type_enum not null,
  provider_id uuid references providers (id), -- audit link, no cascade
  request_id uuid not null references requests (id), -- audit link, no cascade
  score jsonb not null, -- {skillFit, proximity, pay} — write-once, never queried by sub-field
  path jsonb not null -- string[][] graph-path trace — write-once
);
create index matches_request_id_idx on matches (request_id);
create index matches_provider_id_idx on matches (provider_id);

create table teams (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_id uuid not null references requests (id) on delete cascade,
  status team_status_enum not null,
  rationale text not null,
  complete boolean not null
);
create index teams_request_id_idx on teams (request_id);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Purely for deterministic tiebreak parity with Convex's creation-ordered
  -- _id sort (proficiency desc -> distance asc -> id asc in teamAssembly.ts).
  -- Postgres uuid v4 is random, so sort by this instead of `id` for ties.
  seq bigserial not null,
  team_id uuid not null references teams (id) on delete cascade,
  provider_id uuid not null references providers (id) on delete cascade,
  assigned_skill_id uuid not null references skills (id),
  covered_units integer not null,
  state team_member_state_enum not null
);
create index team_members_team_id_idx on team_members (team_id);
create index team_members_provider_id_idx on team_members (provider_id);

create table narrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  match_id uuid not null references matches (id) on delete cascade,
  lang text not null,
  text text not null,
  grounded boolean not null
);
create index narrations_match_id_idx on narrations (match_id);

-- ---------------------------------------------------------------------------
-- Marketplace extras (all outside the match decision)
-- ---------------------------------------------------------------------------

create table ratings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider_id uuid not null references providers (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  stars integer not null,
  comment text
);
create index ratings_provider_id_idx on ratings (provider_id);

create table grievances (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Polymorphic (provider/customer/admin id as string) — no foreign key,
  -- mirrors sessions.user_id.
  reporter_id text not null,
  reporter_role role_enum not null,
  subject text not null,
  body text not null,
  status grievance_status_enum not null
);
create index grievances_reporter_id_idx on grievances (reporter_id);

create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  context_type chat_context_type_enum not null,
  -- Polymorphic (provider/request/team id, or a direct-thread key) — no FK.
  context_id text not null,
  title text not null
);
create index chat_threads_context_idx on chat_threads (context_type, context_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references chat_threads (id) on delete cascade,
  sender_id text not null,
  sender_role role_enum not null,
  body text not null,
  read_at timestamptz
);
create index messages_thread_id_idx on messages (thread_id);

-- ---------------------------------------------------------------------------
-- Chat privacy. Conversations are private to their participants, and that check
-- happens in api/_lib/chatAccess.ts, NOT here.
--
-- It cannot happen here: this app does not use Supabase Auth, so to Postgres every
-- browser caller is the same anonymous role. RLS has no identity to filter on and
-- therefore cannot express "only participants". These tables previously carried
-- `for select using (true)` so a browser-side Supabase client could receive Realtime
-- updates — but that client authenticates with the anon key, which ships in the public
-- JS bundle, so the policy made every message in the app world-readable.
--
-- RLS is enabled with NO policy: anon and authenticated read nothing. Reads and writes
-- go through /api/chat/*, which uses the service-role key (RLS does not apply to it)
-- and checks participation against the `sessions` table. No Supabase client ships to
-- the browser any more; the chat screen polls /api/chat/messages.
--
-- Existing databases need supabase/migrations/003_private_chat_rls.sql to drop the old
-- policies; creating a fresh database from this file is already correct.
-- ---------------------------------------------------------------------------

alter table chat_threads enable row level security;
alter table messages enable row level security;

-- ---------------------------------------------------------------------------
-- Performance indexes. Each corresponds to a filter/sort the API actually issues;
-- see supabase/migrations/004_perf_indexes.sql for the rationale per index.
-- Note `bigserial` does not create an index, so the deterministic `seq` tiebreaks
-- need explicit ones.
-- ---------------------------------------------------------------------------

create index messages_thread_created_idx on messages (thread_id, created_at desc);
create index chat_threads_created_at_idx on chat_threads (created_at desc);
create index near_distances_pair_idx on near_distances (from_location_id, to_location_id);
create index providers_seq_idx on providers (seq);
create index team_members_seq_idx on team_members (seq);
create index requests_customer_created_idx on requests (customer_id, created_at desc);
create index ratings_provider_created_idx on ratings (provider_id, created_at desc);
create index grievances_reporter_created_idx on grievances (reporter_id, created_at desc);
