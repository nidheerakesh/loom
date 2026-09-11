import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";
import { scoreApplicants } from "../../_lib/requestScoring.js";

const Body = z.object({ token: z.string().min(1), requestId: z.string().min(1) });

// "Let the algorithm decide" for individual work — the same choice group orders already had
// (auto-assembly vs. open call), now available for the other staffing path too: instead of
// reading every applicant herself, she can ask the same scoring formula matching/feed.ts
// ranks the job feed by to just pick the best one, exactly like choose-provider.ts would if
// she'd read the list and picked that name herself. It IS choose-provider.ts's own award
// logic underneath — this only adds "who," not a different way of awarding the job.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, customer_id, mode, status, location_id, pay")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request) throw new HttpError(404, "Request not found");
  if (request.customer_id !== s.userId) throw new HttpError(403, "Not your request");
  if (request.mode !== "individual") {
    throw new HttpError(400, "Group requests are staffed by assembling a team or selecting from applicants");
  }
  if (request.status !== "open") throw new HttpError(409, "This work has already been assigned");

  const { data: interested, error: intErr } = await supabaseAdmin
    .from("interests")
    .select("id, provider_id, providers(home_location_id)")
    .eq("request_id", requestId)
    .eq("state", "interested");
  if (intErr) throw new HttpError(500, intErr.message);

  type Row = { id: string; provider_id: string; providers: { home_location_id: string } | null };
  const candidates = ((interested ?? []) as unknown as Row[])
    .filter((r) => r.providers !== null)
    .map((r) => ({ providerId: r.provider_id, homeLocationId: r.providers!.home_location_id }));
  if (candidates.length === 0) throw new HttpError(400, "No applicants yet", "no-applicants");

  const scores = await scoreApplicants(requestId, request.location_id, request.pay ?? null, candidates);

  // Highest total wins; ties broken by proximity (nearer first) then provider id, so this is
  // deterministic the same way every other decision in the engine is — re-running it on an
  // unchanged applicant pool always picks the same person.
  const zeroScore = { skillFit: 0, proximity: 0, pay: 0, total: 0 };
  let bestId = candidates[0].providerId;
  let bestScore = scores.get(bestId) ?? zeroScore;
  for (const c of candidates.slice(1)) {
    const sc = scores.get(c.providerId) ?? zeroScore;
    const better =
      sc.total > bestScore.total ||
      (sc.total === bestScore.total && sc.proximity > bestScore.proximity) ||
      (sc.total === bestScore.total && sc.proximity === bestScore.proximity && c.providerId < bestId);
    if (better) {
      bestId = c.providerId;
      bestScore = sc;
    }
  }
  const chosenInterest = ((interested ?? []) as unknown as Row[]).find((r) => r.provider_id === bestId)!;

  const { error: acceptErr } = await supabaseAdmin
    .from("interests")
    .update({ state: "accepted" })
    .eq("id", chosenInterest.id);
  if (acceptErr) throw new HttpError(500, acceptErr.message);

  const { error: declineErr } = await supabaseAdmin
    .from("interests")
    .update({ state: "declined" })
    .eq("request_id", requestId)
    .neq("provider_id", bestId);
  if (declineErr) throw new HttpError(500, declineErr.message);

  const { error: statusErr } = await supabaseAdmin
    .from("requests")
    .update({ status: "assigned" })
    .eq("id", requestId);
  if (statusErr) throw new HttpError(500, statusErr.message);

  const { error: auditErr } = await supabaseAdmin.from("matches").insert({
    type: "individual",
    provider_id: bestId,
    request_id: requestId,
    score: { awardedBy: "algorithm" as const, ...bestScore },
    path: [["request", requestId], ["provider", bestId]],
  });
  if (auditErr) throw new HttpError(500, auditErr.message);

  res.status(200).json({ providerId: bestId, score: bestScore.total });
});
