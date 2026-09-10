import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireSession } from "../../_lib/auth.js";
import { requireCoordinator } from "../../_lib/coordinator.js";

const Body = z.object({ token: z.string().min(1), requestId: z.string().min(1) });

// The coordinator's check that the work is right before the job can be marked finished. Only
// meaningful — and only reachable — when someone other than the customer is coordinating: if
// she appointed herself (the default), requests/complete.ts treats completing the job as the
// sign-off, so there is nothing separate for her to do here.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId } = Body.parse(req.body);
  const s = await requireSession(token);
  const request = await requireCoordinator(s, requestId);

  if (request.coordinator_role !== "provider") {
    throw new HttpError(400, "Only an appointed provider coordinator signs off separately");
  }
  // Signing off before there is a team to have done any work is not meaningful — mirrors
  // complete.ts's own "not assigned yet" guard.
  if (request.status !== "assigned") {
    throw new HttpError(409, "This work has not been assigned yet");
  }

  const { error } = await supabaseAdmin
    .from("requests")
    .update({ coordinator_signed_off_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) throw new HttpError(500, error.message);

  res.status(200).json(null);
});
