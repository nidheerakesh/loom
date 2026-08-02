import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service role key (bypasses RLS).
// Our own bearer-token session check (see ./auth.ts) is the authorization
// boundary for now — never import this from src/, only from api/ handlers.
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});
