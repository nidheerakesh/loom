// Local stand-in for `vercel dev`, which crashes in some sandboxed environments.
// Resolves routes through `api/_routes/index.ts` — the same map `api/[...path].ts`
// dispatches through in production — so the exact same handler files run in local dev
// and on Vercel, with no separate dev-only code path and no second routing table to keep
// in sync. Run via `npm run dev:api`; Vite's dev server proxies /api/* to this (see
// vite.config.ts), matching same-origin production behavior.
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { routes } from "../api/_routes";

const PORT = Number(process.env.API_PORT ?? 3001);

type Handler = (req: unknown, res: unknown) => Promise<void>;

function resolveHandler(urlPath: string): Handler | null {
  // "/api/auth/verify-otp" -> routes["auth/verify-otp"]
  const key = urlPath.replace(/^\/api\/?/, "").replace(/^\/+|\/+$/g, "");
  return (routes as Record<string, Handler>)[key] ?? null;
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
  const handler = resolveHandler(url.pathname);
  if (!handler) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams) query[k] = v;
  const body = req.method === "POST" ? await readJsonBody(req) : undefined;

  await handler({ query, body, method: req.method }, wrapResponse(res));
});

server.listen(PORT, () => {
  console.log(`[dev-api] listening on http://localhost:${PORT}`);
});
