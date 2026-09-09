import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ZodError } from "zod";

// Thrown by route handlers / auth.ts to signal a specific HTTP status.
// Everything else that throws maps to 500 with no stack/message leaked.
// `reason` is an optional stable machine-readable code, so a client can translate the failure
// instead of showing an English sentence from the server. Sign-in needs this: "the code is
// wrong", "it expired", and "you have tried too many times" are three different instructions
// to the woman holding the phone, and she may not read English.
export class HttpError extends Error {
  status: number;
  reason?: string;
  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

export function withHandler(fn: Handler): Handler {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof HttpError) {
        res.status(e.status).json(e.reason ? { error: e.message, reason: e.reason } : { error: e.message });
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
