import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

const Body = z.object({ token: z.string().min(1), requestId: z.string().min(1), accept: z.boolean() });

// A provider putting their hand up for a request. This registers INTEREST — it does not win
// the job.
//
// It used to: the first provider to tap was written straight to 'accepted' and the request
// flipped to 'assigned', so the work went to whoever happened to tap first and every other
// provider silently lost. The customer never got to choose, and the 'interested' state was
// dead in production. requests/choose-provider.ts is where a job is actually awarded.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId, accept } = Body.parse(req.body);
  const s = await requireRole(token, "provider");

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, status, mode")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request) throw new HttpError(404, "Request not found");

  // Group orders are staffed by team assembly and never consult `interests`, so an
  // application to one could never be answered by anybody. Refused rather than accepted into
  // a state with no exit.
  if (accept && request.mode !== "individual") {
    throw new HttpError(400, "Group work is staffed by assembling a team");
  }

  // Once the customer has awarded the work there is nothing left to express interest in.
  if (accept && request.status !== "open") {
    throw new HttpError(409, "This work is no longer open");
  }

  const state = accept ? "interested" : "declined";

  const { data: existing, error: findErr } = await supabaseAdmin
    .from("interests")
    .select("id, state")
    .eq("provider_id", s.userId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (findErr) throw new HttpError(500, findErr.message);

  // Withdrawing after being awarded the job is a different action with different
  // consequences for the customer; not supported through this route.
  if (existing?.state === "accepted") {
    throw new HttpError(409, "You have already been assigned this work");
  }

  if (existing) {
    const { error } = await supabaseAdmin.from("interests").update({ state }).eq("id", existing.id);
    if (error) throw new HttpError(500, error.message);
  } else {
    const { error } = await supabaseAdmin
      .from("interests")
      .insert({ provider_id: s.userId, request_id: requestId, state });
    if (error) throw new HttpError(500, error.message);
  }

  res.status(200).json({ state });
});
