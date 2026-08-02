import { createClient } from "@supabase/supabase-js";

// The ONE place a Supabase client ships to the browser (anon key, public-read RLS on
// chat_threads/messages only — see supabase/schema.sql). Used exclusively for
// `.channel().on('postgres_changes', ...).subscribe()` in Communities.tsx; never call
// `.from().select()` on this client — all reads/writes go through the /api/chat/* routes.
export const supabaseRealtime = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { auth: { persistSession: false } },
);
