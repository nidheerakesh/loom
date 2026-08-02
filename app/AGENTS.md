This project uses Supabase (Postgres) for storage and Vercel Serverless Functions for the
backend. See `api/_lib/` for shared server-side utilities and `supabase/schema.sql` for the
schema. Never import `@supabase/supabase-js` with the service-role key from `src/` — only
`api/` handlers may use `api/_lib/supabase.ts`'s `supabaseAdmin` client.
