// Thin fetch wrapper for the /api/* Vercel functions, replacing convex/react's
// useQuery/useMutation/useAction. Same-origin — Vercel serves /api alongside the SPA.

export class ApiError extends Error {}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(typeof body.error === "string" ? body.error : `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
  const entries = Object.entries(params ?? {}).filter(([, v]) => v !== undefined) as [string, string][];
  const qs = entries.length ? `?${new URLSearchParams(entries).toString()}` : "";
  const res = await fetch(path + qs);
  return handle<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return handle<T>(res);
}

// Shared polling interval for the "polling everywhere except chat" realtime strategy.
export const POLL_MS = 7000;
