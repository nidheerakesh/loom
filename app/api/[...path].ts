import type { VercelRequest, VercelResponse } from "@vercel/node";
import { routes } from "./_routes";

// The ONE serverless function for the whole API. Vercel creates a function per file under
// `api/`, and the Hobby plan caps a deployment at 12 — we have 32 routes, so shipping them
// as individual files fails the deploy outright. This catch-all takes every /api/* request
// and dispatches it to the real handler in `_routes/` (underscore-prefixed directories are
// excluded from Vercel's function detection, so nothing in there becomes a function itself).
// Bonus: one function means one warm instance serving all routes instead of 32 cold starts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // `path` comes from the [...path] segment: /api/auth/me -> ["auth", "me"].
  const raw = (req.query as Record<string, string | string[] | undefined>).path;
  const key = (Array.isArray(raw) ? raw.join("/") : (raw ?? "")).replace(/^\/+|\/+$/g, "");

  const route = routes[key];
  if (!route) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await route(req, res);
}
