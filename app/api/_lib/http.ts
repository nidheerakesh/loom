import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ZodError } from "zod";

// Thrown by route handlers / auth.ts to signal a specific HTTP status.
// Everything else that throws maps to 500 with no stack/message leaked.
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

export function withHandler(fn: Handler): Handler {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) {
        res.status(e.status).json({ error: e.message });
        return;
      }
      if (e instanceof ZodError) {
        res.status(400).json({ error: e.issues.map((i) => i.message).join("; ") });
        return;
      }
      console.error("[api] unhandled error", e);
      res.status(500).json({ error: "Internal error" });
    }
  };
}
