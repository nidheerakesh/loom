import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

const Body = z.object({
  token: z.string().min(1),
  requestId: z.string().min(1),
  providerIds: z.array(z.string().min(1)).min(1),
});

// The customer's half of the open call: pick who she wants from everyone who put their hand
// up for a group order, in one decision. The mirror of choose-provider.ts, but many rather
// than one — a group order has no single winner.
//
// Deliberately does not touch `teams` / `team_members`. Those tables carry a per-skill unit
// split that team-assembly's coverage engine computes; an open call has no such split — the
// customer is choosing people, not covering units — and forcing this through that schema
// would mean inventing numbers nobody entered. `interests` already carries everything this
// needs: who is on the job (state 'accepted') and who is not (state 'declined'), exactly the
// distinction requests/my-accepted.ts and matching/feed.ts already read.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId, providerIds } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, customer_id, mode, status, headcount")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request) throw new HttpError(404, "Request not found");
  if (request.customer_id !== s.userId) throw new HttpError(403, "Not your request");
  if (request.mode !== "group") throw new HttpError(400, "Only group orders are staffed by selection");
  // Guards against re-selecting, including two rapid taps.
  if (request.status !== "open") throw new HttpError(409, "This work has already been staffed");

  // She may pick fewer than she asked for — nobody suitable applied, or she changed her mind —
  // but not more. The headcount is what every applicant saw when they applied.
  if (request.headcount && providerIds.length > request.headcount) {
    throw new HttpError(
      400,
      `You asked for ${request.headcount}; that is ${providerIds.length} people`,
      "over-headcount",
    );
  }

  const { data: interested, error: intErr } = await supabaseAdmin
    .from("interests")
    .select("id, provider_id")
    .eq("request_id", requestId)
    .eq("state", "interested")
    .in("provider_id", providerIds);
  if (intErr) throw new HttpError(500, intErr.message);
  if ((interested ?? []).length !== providerIds.length) {
    throw new HttpError(400, "One of those providers did not apply, or is no longer available");
  }

  const selectedIds = (interested ?? []).map((i) => i.id);
  const { error: acceptErr } = await supabaseAdmin
    .from("interests")
    .update({ state: "accepted" })
    .in("id", selectedIds);
  if (acceptErr) throw new HttpError(500, acceptErr.message);

  // Everyone else who applied is told, rather than left waiting on a call already closed.
  const { error: declineErr } = await supabaseAdmin
    .from("interests")
    .update({ state: "declined" })
    .eq("request_id", requestId)
    .eq("state", "interested");
  if (declineErr) throw new HttpError(500, declineErr.message);

  const { error: statusErr } = await supabaseAdmin
    .from("requests")
    .update({ status: "assigned" })
    .eq("id", requestId);
  if (statusErr) throw new HttpError(500, statusErr.message);

  // Audit rows, one per selected provider, matching the shape choose-provider.ts writes for an
  // individual award — so an open-call selection is just as traceable as any other.
  const { error: auditErr } = await supabaseAdmin.from("matches").insert(
    providerIds.map((providerId) => ({
      type: "team" as const,
      provider_id: providerId,
      request_id: requestId,
      score: { awardedBy: "customer", openCall: true },
      path: [["request", requestId], ["provider", providerId]],
    })),
  );
  if (auditErr) throw new HttpError(500, auditErr.message);

  res.status(200).json({ selected: providerIds.length });
});
