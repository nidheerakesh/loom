import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

const Body = z.object({ token: z.string().min(1), requestId: z.string().min(1), accept: z.boolean() });

// The provider's half of being appointed coordinator. Mirrors team_members' invited/accepted/
// declined exactly — appointment was unilateral before this (requests/set-coordinator.ts just
// wrote her in), and requests/complete.ts would then wait on a sign-off from someone who had
// never actually agreed to give one, with no timeout and no way out except the customer
// happening to notice and re-appoint someone else herself.
//
// Declining doesn't leave the job stuck waiting on a decision nobody can make: it reverts the
// coordinator role straight back to the customer, the same way a declined team slot is simply
// vacant rather than an error state. Unlike a first-time appointment, though, this isn't a
// quiet revert to "customer" as if nothing had happened — coordinator_response stays
// 'declined' (not silently forced to 'accepted') so the customer's own screen can tell her,
// and coordinator_decided_at is cleared so "start work" is held behind picking someone new
// rather than quietly falling back to a decision she never made. She cannot re-send this same
// appointment either: set-coordinator.ts checks coordinator_declined_ids, which this appends to.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId, accept } = Body.parse(req.body);
  const s = await requireRole(token, "provider");

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, mode, status, coordinator_role, coordinator_provider_id, coordinator_response, coordinator_declined_ids")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request) throw new HttpError(404, "Request not found");
  if (request.mode !== "group") throw new HttpError(400, "Only group orders have a coordinator");
  if (request.coordinator_role !== "provider" || request.coordinator_provider_id !== s.userId) {
    throw new HttpError(403, "You are not appointed coordinator for this job");
  }
  if (request.coordinator_response !== "pending") {
    throw new HttpError(409, "You have already answered this");
  }

  const patch = accept
    ? { coordinator_response: "accepted" as const }
    : {
        coordinator_role: "customer" as const,
        coordinator_provider_id: null,
        coordinator_response: "declined" as const,
        coordinator_appointed_at: null,
        coordinator_signed_off_at: null,
        coordinator_decided_at: null,
        coordinator_declined_ids: [...(request.coordinator_declined_ids ?? []), s.userId],
      };

  const { error: updErr } = await supabaseAdmin.from("requests").update(patch).eq("id", requestId);
  if (updErr) throw new HttpError(500, updErr.message);

  res.status(200).json(null);
});
