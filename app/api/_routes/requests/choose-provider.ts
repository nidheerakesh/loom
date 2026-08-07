import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

const Body = z.object({
  token: z.string().min(1),
  requestId: z.string().min(1),
  providerId: z.string().min(1),
});

// The customer awards an individual job to one of the providers who expressed interest.
//
// This is the only place `interests.state` becomes 'accepted'. Several providers may put
// their hand up; exactly one gets the work, and the customer decides which — previously the
// job went to whoever tapped first, with no say from the customer at all.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId, providerId } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, customer_id, mode, status")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request) throw new HttpError(404, "Request not found");
  if (request.customer_id !== s.userId) throw new HttpError(403, "Not your request");

  // Group orders are staffed by team assembly, not by picking a single provider.
  if (request.mode !== "individual") {
    throw new HttpError(400, "Group requests are staffed by assembling a team");
  }
  // Guards against awarding the same job twice — including two rapid taps.
  if (request.status !== "open") throw new HttpError(409, "This work has already been assigned");

  const { data: chosen, error: chosenErr } = await supabaseAdmin
    .from("interests")
    .select("id, state")
    .eq("request_id", requestId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (chosenErr) throw new HttpError(500, chosenErr.message);
  if (!chosen || chosen.state === "declined") {
    throw new HttpError(400, "That provider is not available for this work");
  }

  const { error: acceptErr } = await supabaseAdmin
    .from("interests")
    .update({ state: "accepted" })
    .eq("id", chosen.id);
  if (acceptErr) throw new HttpError(500, acceptErr.message);

  // Everyone else is told, rather than left waiting indefinitely on a job already given away.
  const { error: declineErr } = await supabaseAdmin
    .from("interests")
    .update({ state: "declined" })
    .eq("request_id", requestId)
    .neq("provider_id", providerId);
  if (declineErr) throw new HttpError(500, declineErr.message);

  const { error: statusErr } = await supabaseAdmin
    .from("requests")
    .update({ status: "assigned" })
    .eq("id", requestId);
  if (statusErr) throw new HttpError(500, statusErr.message);

  // Audit row, matching what team confirmation writes, so an individual award is just as
  // traceable as a collective one (goal G4).
  const { error: auditErr } = await supabaseAdmin.from("matches").insert({
    type: "individual",
    provider_id: providerId,
    request_id: requestId,
    score: { awardedBy: "customer" },
    path: [["request", requestId], ["provider", providerId]],
  });
  if (auditErr) throw new HttpError(500, auditErr.message);

  res.status(200).json(null);
});
