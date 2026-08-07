-- Sign-in became phone + OTP only: the role is resolved from the account after the code is
-- verified, not chosen before it is sent. `otps.role` therefore no longer means anything --
-- request-otp writes a constant to satisfy NOT NULL, and verify-otp does not read it.
--
-- Not applied automatically: this needs Postgres credentials (the service role key is a
-- PostgREST key, not a DB password). Run it from the Supabase SQL Editor, or:
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/001_drop_otps_role.sql
--
-- Safe to run at any time. The application does not read the column either way; dropping it
-- only removes the misleading constant. Rows in `otps` are short-lived (5 minute TTL), so
-- there is no data worth preserving here.

alter table otps drop column if exists role;
