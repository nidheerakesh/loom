-- Loom marketplace schema (Supabase/Postgres). Mirrors the Convex model.
-- Reference tables (skills, geography) + user data. Heavy writes go through Edge
-- Functions (service role, bypass RLS); clients get SELECT + owner-scoped writes.

create extension if not exists pgcrypto;

-- ---------- cluster / geography ----------
create table cds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  panchayat text not null
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cds_id uuid not null references cds(id) on delete cascade
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  lat double precision not null,
  lng double precision not null,
  label text not null
);

create table near_distances (
  id uuid primary key default gen_random_uuid(),
  from_location_id uuid not null references locations(id) on delete cascade,
  to_location_id uuid not null references locations(id) on delete cascade,
  distance_km double precision not null
);
create index near_from_idx on near_distances(from_location_id);

-- ---------- skills + canonicalization ----------
create table skills (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  canonical_name_ml text,
  icon_key text not null default '🛠️'
);

create table skill_aliases (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references skills(id) on delete cascade,
  alias_text text not null,
  source text not null default 'curated' check (source in ('curated','approved'))
);
create index alias_text_idx on skill_aliases(alias_text);
create index alias_skill_idx on skill_aliases(skill_id);

create table skill_candidates (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  nearest_skill_id uuid references skills(id),
  similarity double precision not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- ---------- providers ----------
create table providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null default 'New provider',
  shop_name text,
  available boolean not null default true,
  capacity integer not null default 1,
  rate numeric,
  rate_unit text,
  delivery_days integer,
  experience_years integer not null default 0,
  rating numeric not null default 0,
  rating_count integer not null default 0,
  languages text[] not null default '{ml}',
  home_location_id uuid references locations(id),
  group_id uuid references groups(id),
  created_at timestamptz not null default now()
);
create index providers_group_idx on providers(group_id);

create table provider_skills (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  proficiency integer not null default 3,
  rate numeric,
  unique (provider_id, skill_id)
);
create index provider_skills_provider_idx on provider_skills(provider_id);
create index provider_skills_skill_idx on provider_skills(skill_id);

create table portfolio_items (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  storage_path text,
  caption text,
  created_at timestamptz not null default now()
);
create index portfolio_provider_idx on portfolio_items(provider_id);

-- ---------- customers ----------
create table customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null default 'New customer',
  company text,
  location_id uuid references locations(id),
  created_at timestamptz not null default now()
);

-- ---------- requests ----------
create table requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  mode text not null check (mode in ('individual','group')),
  units integer not null default 1,
  pay numeric,
  deadline text,
  location_id uuid references locations(id),
  status text not null default 'open' check (status in ('open','assembling','assigned','completed')),
  customer_id uuid not null references customers(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index requests_customer_idx on requests(customer_id);
create index requests_status_idx on requests(status);

create table request_skills (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  quantity integer not null default 1
);
create index request_skills_request_idx on request_skills(request_id);
create index request_skills_skill_idx on request_skills(skill_id);

create table interests (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  request_id uuid not null references requests(id) on delete cascade,
  state text not null default 'interested' check (state in ('interested','accepted','declined')),
  unique (provider_id, request_id)
);
create index interests_request_idx on interests(request_id);
create index interests_provider_idx on interests(provider_id);

-- ---------- matching audit + teams ----------
create table matches (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('individual','team')),
  provider_id uuid references providers(id) on delete cascade,
  request_id uuid not null references requests(id) on delete cascade,
  score jsonb not null default '{}',
  path jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index matches_request_idx on matches(request_id);
create index matches_provider_idx on matches(provider_id);

create table teams (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  status text not null default 'proposed' check (status in ('proposed','confirmed')),
  rationale text not null default '',
  complete boolean not null default false,
  created_at timestamptz not null default now()
);
create index teams_request_idx on teams(request_id);

create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  provider_id uuid not null references providers(id) on delete cascade,
  assigned_skill_id uuid not null references skills(id),
  covered_units integer not null default 0,
  state text not null default 'invited' check (state in ('invited','accepted','declined'))
);
create index team_members_team_idx on team_members(team_id);
create index team_members_provider_idx on team_members(provider_id);

create table narrations (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  lang text not null default 'ml',
  text text not null,
  grounded boolean not null default true
);
create index narrations_match_idx on narrations(match_id);

-- ---------- marketplace extras ----------
create table ratings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
create index ratings_provider_idx on ratings(provider_id);

create table grievances (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reporter_role text not null,
  subject text not null,
  body text not null,
  status text not null default 'open' check (status in ('open','reviewing','resolved')),
  created_at timestamptz not null default now()
);
create index grievances_reporter_idx on grievances(reporter_user_id);

create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  context_type text not null check (context_type in ('provider','request','team','direct')),
  context_id text not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (context_type, context_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_thread_idx on messages(thread_id);

-- ---------- helpers ----------
create or replace function my_provider_id() returns uuid language sql stable as $$
  select id from providers where user_id = auth.uid()
$$;
create or replace function my_customer_id() returns uuid language sql stable as $$
  select id from customers where user_id = auth.uid()
$$;
