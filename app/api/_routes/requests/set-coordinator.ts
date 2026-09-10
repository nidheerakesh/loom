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
  // The real, finalised rate — set here rather than at posting, because the point of a
  // coordinator is that the price is settled after the team is chosen and has actually talked
  // to each other, not guessed at before anyone was even picked.
  agreedRate: z.number().nonnegative().max(10_000_000).optional(),
  agreedRateUnit: z.string().max(40).optional(),
});

// Naming who is accountable for a group order, and settling the real rate — deliberately a
// step that happens AFTER staffing, not at creation. She doesn't know who's actually on the
// team until people have applied or been assembled, and the price the team agrees to pay is
// something to settle once they've actually talked, not guess at up front (requests/create.ts
// still accepts an optional starting figure — shown to applicants as what she expects to pay,
// not a locked number).
//
// Reachable any time before the job is marked finished, not only while `status === 'open'` —
// this is exactly the step that normally happens once the team exists. Only `completed` is off
// limits: once the job is done, there's nothing left to settle.
//
// The named provider is not required to already be on the team — a customer may want her own
// trusted SHG contact coordinating even before anyone has applied or been selected.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId, coordinatorRole, coordinatorProviderId, agreedRate, agreedRateUnit } = Body.parse(req.body);
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
  if (request.status === "completed") throw new HttpError(409, "This work is already finished");

  if (coordinatorRole === "provider" && coordinatorProviderId) {
    const { data: coord, error: coordErr } = await supabaseAdmin
      .from("providers")
      .select("id")
      .eq("id", coordinatorProviderId)
      .maybeSingle();
    if (coordErr) throw new HttpError(500, coordErr.message);
    if (!coord) throw new HttpError(400, "That provider does not exist");
  }

  const patch: Record<string, unknown> = {
    coordinator_role: coordinatorRole,
    coordinator_provider_id: coordinatorRole === "provider" ? coordinatorProviderId : null,
    // A change of coordinator invalidates any earlier sign-off — the person who signed off
    // may no longer be the one accountable.
    coordinator_signed_off_at: null,
    // An appointed provider starts back at 'pending' — even if she's being re-appointed after
    // previously declining, this is a fresh ask and deserves a fresh answer, not the old one
    // carried over. The customer herself needs no response of her own; she can't decline
    // being accountable for her own order.
    coordinator_response: coordinatorRole === "provider" ? "pending" : "accepted",
    coordinator_appointed_at: coordinatorRole === "provider" ? new Date().toISOString() : null,
  };
  if (agreedRate !== undefined) patch.agreed_rate = agreedRate;
  if (agreedRateUnit !== undefined) patch.agreed_rate_unit = agreedRateUnit;

  const { error: updErr } = await supabaseAdmin.from("requests").update(patch).eq("id", requestId);
  if (updErr) throw new HttpError(500, updErr.message);

  res.status(200).json(null);
});
