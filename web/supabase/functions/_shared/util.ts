// Shared helpers for Loom Edge Functions (Deno).
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

// Service-role client (bypasses RLS) for all writes/reads inside functions.
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// Resolve the calling user from their JWT (Authorization header).
export async function getUser(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const client = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data } = await client.auth.getUser();
  return data.user;
}

// --- deterministic text (S9) ---
export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function trigrams(s: string): Set<string> {
  const t = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

export function similarity(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  if (na === nb) return 1;
  const ta = trigrams(na), tb = trigrams(nb);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

export const SKILL_MERGE_THRESHOLD = 0.5;

// --- scoring (deterministic) ---
export const WEIGHTS = { skill: 0.5, dist: 0.3, earn: 0.2 };
export function proximity(km: number): number {
  return isFinite(km) ? 1 / (1 + km) : 0;
}
export function normalizedPay(pay: number | null | undefined): number {
  return pay && pay > 0 ? Math.min(1, pay / 2000) : 0;
}
export function skillFit(prof: number): number {
  return Math.max(0, Math.min(1, prof / 5));
}
