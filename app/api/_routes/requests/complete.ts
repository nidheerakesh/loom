import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

const Body = z.object({ token: z.string().min(1), requestId: z.string().min(1) });

// The customer marks work finished. `requests.status` has always had a 'completed' value but
// nothing ever set it, so every job stayed 'assigned' forever — a provider's work list only
// grew, and "People you've worked with" had no notion of a finished job.
//
// The customer closes it rather than the provider: they are the one who can tell whether the
// work actually arrived, and it gates the rating.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, customer_id, mode, status, coordinator_role, coordinator_signed_off_at")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request) throw new HttpError(404, "Request not found");
  if (request.customer_id !== s.userId) throw new HttpError(403, "Not your request");

  // Only work that was actually assigned can be finished — closing an open request would
  // strand the providers who applied, and closing a completed one is a no-op worth rejecting
  // so a double tap does not read as success twice.
  if (request.status === "completed") throw new HttpError(409, "This work is already finished");
  if (request.status !== "assigned") {
    throw new HttpError(409, "This work has not been assigned yet");
  }

  // A group order with an appointed provider coordinator needs HER sign-off before the
  // customer can close it out — that is the entire point of appointing someone other than
  // herself. When the coordinator is the customer (the default), completing the job IS the
  // sign-off: the same tap satisfies both, no second click for something she is already both
  // sides of.
  if (request.mode === "group" && request.coordinator_role === "provider" && !request.coordinator_signed_off_at) {
    throw new HttpError(409, "Waiting on the coordinator to sign off before this can be marked finished", "awaiting-coordinator-signoff");
  }

  const { error } = await supabaseAdmin
    .from("requests")
    .update({
      status: "completed",
      coordinator_signed_off_at: request.coordinator_signed_off_at ?? new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) throw new HttpError(500, error.message);

  res.status(200).json(null);
});
