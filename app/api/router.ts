import type { VercelRequest, VercelResponse } from "@vercel/node";
import { routes } from "./_routes";

// The ONE serverless function for the whole API.
//
// Two constraints shape this file, and both were found the hard way:
//
// 1. Vercel creates a function per file under `api/`, and the Hobby plan caps a deployment
//    at 12. With 32 routes as individual files the build succeeds and the *deploy* then
//    fails — so the routes have to live in `_routes/` (underscore directories are excluded
//    from function detection) behind a single entry point.
//
// 2. That entry point must have a STATIC filename. The obvious spelling, `api/[...path].ts`,
//    builds fine and is never routed to: Vercel returns its own NOT_FOUND for every /api/*
//    request, with no invocation and no runtime logs. A static `api/ping.ts` deployed beside
//    it answered 200, which pinned the fault to catch-all routing specifically.
//
// So: static filename here, and `vercel.json` rewrites /api/* onto it with the original path
// preserved in `?path=`. Public URLs are unchanged — /api/auth/me still works.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = (req.query as Record<string, string | string[] | undefined>).path;
  const key = (Array.isArray(raw) ? raw.join("/") : (raw ?? "")).replace(/^\/+|\/+$/g, "");

  const route = routes[key];
  if (!route) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await route(req, res);
}
