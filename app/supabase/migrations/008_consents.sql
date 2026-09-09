-- A record that a phone number's holder agreed to the consent copy before her account was
-- created. Kept as its own table, keyed on phone_hash rather than a column on
-- providers/customers, because consent belongs to the PERSON, not the role: she can hold a
-- provider row, a customer row, or both, and switching roles or re-signing-up after a deletion
-- should not lose the record of when she agreed and to which version.
--
-- No FK to providers/customers — a phone_hash can predate either row (consent is recorded
-- before createAccount runs, see complete-login.ts) and can outlive both (account deletion
-- leaves the consent record as the only evidence the agreement ever happened).
create table consents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  phone_hash text not null,
  version text not null
);
create index consents_phone_hash_idx on consents (phone_hash);

-- RLS is on for every other table (005_enable_rls_everywhere.sql) because a table without it
-- is readable by anyone holding the public anon key, which ships inside the JS bundle. A new
-- table defaults to no RLS, so this is not optional here either — enabling with no policy
-- denies anon/authenticated entirely; the service-role key api/_lib/supabase.ts uses bypasses
-- RLS, so the API keeps working untouched.
alter table consents enable row level security;
