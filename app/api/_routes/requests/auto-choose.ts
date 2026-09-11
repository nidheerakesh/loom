import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";
import { scoreApplicants } from "../../_lib/requestScoring.js";

const Body = z.object({ token: z.string().min(1), requestId: z.string().min(1) });

// "Let the algorithm decide" for individual work — the same choice group orders already had
// (auto-assembly vs. open call), now available for the other staffing path too: the same
// scoring formula matching/feed.ts ranks the job feed by picks the best applicant, instead of
// her reading every one herself.
//
// Read-only on purpose — this used to award the job immediately, with no way to see who got
// picked before it happened. Now it only computes and returns the pick; the frontend shows her
// the name and score, and she finalizes it with a second, explicit call to the same
// choose-provider.ts a manual pick would use. "Auto select" chooses WHO, not a different way
// of awarding the job — finalizing is still one real decision, hers.
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
    .select("provider_id, providers(home_location_id, name, shop_name)")
    .eq("request_id", requestId)
    .eq("state", "interested");
  if (intErr) throw new HttpError(500, intErr.message);

  type Row = { provider_id: string; providers: { home_location_id: string; name: string; shop_name: string | null } | null };
  const rows = ((interested ?? []) as unknown as Row[]).filter((r) => r.providers !== null);
  const candidates = rows.map((r) => ({ providerId: r.provider_id, homeLocationId: r.providers!.home_location_id }));
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
  const chosen = rows.find((r) => r.provider_id === bestId)!;

  res.status(200).json({
    providerId: bestId,
    name: chosen.providers!.name,
    shopName: chosen.providers!.shop_name,
    score: bestScore.total,
  });
});
