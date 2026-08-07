-- The UI no longer shows emoji icons for skills; they render as Malayalam/English text.
-- `skills.icon_key` is therefore unused. It is NOT NULL, so until this runs both writers
-- (scripts/seedHelpers.ts and api/_routes/skills/resolve.ts) insert an empty string.
--
-- Not applied automatically: this needs Postgres credentials (the service role key is a
-- PostgREST key, not a DB password). Run it from the Supabase SQL Editor, or:
--   psql "$SUPABASE_DB_URL" -f supabase/migrations/002_drop_skills_icon_key.sql
--
-- Run 001 at the same time if you have not already.

alter table skills drop column if exists icon_key;
