import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

const Body = z.object({
  token: z.string().min(1),
  requestId: z.string().min(1),
  coordinatorRole: z.enum(["customer", "provider"]),
  coordinatorProviderId: z.string().min(1).optional(),
});

// Changing who is accountable for a group order after it was posted — she may not have
// decided at creation time, or may change her mind once she sees who applied.
//
// Same edit window requests/update.ts already enforces: only while `status === 'open'`. Once
// the job is staffed, providers have arranged their work around who they agreed is
// coordinating it, and swapping that out from under them is a different job, not an edit.
//
// The named provider is not required to already be on the team — a customer may want her own
// trusted SHG contact coordinating even before anyone has applied or been selected.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId, coordinatorRole, coordinatorProviderId } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  if (coordinatorRole === "provider" && !coordinatorProviderId) {
    throw new HttpError(400, "coordinatorProviderId is required when appointing a provider");
  }

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, customer_id, mode, status")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request) throw new HttpError(404, "Request not found");
  if (request.customer_id !== s.userId) throw new HttpError(403, "Not your request");
  if (request.mode !== "group") throw new HttpError(400, "Only group orders have a coordinator");
  if (request.status !== "open") throw new HttpError(409, "This work can no longer be edited");

  if (coordinatorRole === "provider" && coordinatorProviderId) {
    const { data: coord, error: coordErr } = await supabaseAdmin
      .from("providers")
      .select("id")
      .eq("id", coordinatorProviderId)
      .maybeSingle();
    if (coordErr) throw new HttpError(500, coordErr.message);
    if (!coord) throw new HttpError(400, "That provider does not exist");
  }

  const { error: updErr } = await supabaseAdmin
    .from("requests")
    .update({
      coordinator_role: coordinatorRole,
      coordinator_provider_id: coordinatorRole === "provider" ? coordinatorProviderId : null,
      // A change of coordinator invalidates any earlier sign-off — the person who signed off
      // may no longer be the one accountable.
      coordinator_signed_off_at: null,
    })
    .eq("id", requestId);
  if (updErr) throw new HttpError(500, updErr.message);

  res.status(200).json(null);
});
