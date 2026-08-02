// Local stand-in for `vercel dev`, which crashes in some sandboxed environments.
// Serves api/**/*.ts with the same file-based routing Vercel uses in production
// (api/auth/me.ts -> /api/auth/me), so the exact same handler files run in local dev
// and on Vercel — no separate dev-only code path. Run via `npm run dev:api`; Vite's
// dev server proxies /api/* to this (see vite.config.ts), matching same-origin
// production behavior.
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PORT = Number(process.env.API_PORT ?? 3001);
const API_DIR = path.join(process.cwd(), "api");

type Handler = (req: unknown, res: unknown) => Promise<void>;

function resolveHandlerFile(urlPath: string): string | null {
  // "/api/auth/verify-otp" -> "<API_DIR>/auth/verify-otp.ts"
  // "/api/providers/portfolio" -> "<API_DIR>/providers/portfolio/index.ts" (folder route)
  const rel = urlPath.replace(/^\/api\/?/, "");
  if (rel.includes("..")) return null;
  const direct = path.join(API_DIR, rel + ".ts");
  if (existsSync(direct)) return direct;
  const indexed = path.join(API_DIR, rel, "index.ts");
  if (existsSync(indexed)) return indexed;
  return null;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function wrapResponse(res: ServerResponse) {
  return {
    status(code: number) {
      res.statusCode = code;
      return {
        json(body: unknown) {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        },
      };
    },
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const file = resolveHandlerFile(url.pathname);
  if (!file) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams) query[k] = v;
  const body = req.method === "POST" ? await readJsonBody(req) : undefined;

  const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`); // bust cache each request in dev
  const handler = mod.default as Handler;
  await handler({ query, body, method: req.method }, wrapResponse(res));
});

server.listen(PORT, () => {
  console.log(`[dev-api] listening on http://localhost:${PORT}`);
});
