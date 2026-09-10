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
// `interests` alone carries who is on the job (state 'accepted') and who is not ('declined'),
// which is everything requests/my-accepted.ts and matching/feed.ts need. But a `teams` row is
// what gives the selected people somewhere to talk — team-assembly/confirm.ts creates a
// team-context chat thread the moment a team is confirmed, and that machinery (membership
// resolution, the customer's own Teams screen) already exists and is already tested; reusing
// it here rather than inventing a second "who can message whom" system for the open call. The
// per-skill unit split that row usually carries is genuinely not meaningful for an open call
// (the customer chose people, not units), so covered_units is an even split across whoever she
// picked — approximate on purpose, cosmetic, not read by anything that enforces coverage.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId, providerIds } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, customer_id, mode, status, headcount, units")
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

  // One skill to attach every member to — open-call orders are not staffed per-skill the way
  // auto-assembly is, so there is no real per-provider skill to record; the request's own
  // first skill is a label, not a coverage claim.
  const { data: reqSkills, error: rsErr } = await supabaseAdmin
    .from("request_skills")
    .select("skill_id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true })
    .limit(1);
  if (rsErr) throw new HttpError(500, rsErr.message);
  const skillId = reqSkills?.[0]?.skill_id;

  if (skillId) {
    const evenShare = Math.max(1, Math.round(request.units / providerIds.length));
    const { data: team, error: teamInsErr } = await supabaseAdmin
      .from("teams")
      .insert({
        request_id: requestId,
        status: "confirmed",
        rationale: `${providerIds.length} provider${providerIds.length > 1 ? "s" : ""} selected from an open call.`,
        complete: true,
      })
      .select("id")
      .single();
    if (teamInsErr) throw new HttpError(500, teamInsErr.message);

    const { error: memErr } = await supabaseAdmin.from("team_members").insert(
      providerIds.map((providerId) => ({
        team_id: team.id,
        provider_id: providerId,
        assigned_skill_id: skillId,
        covered_units: evenShare,
        state: "accepted" as const,
      })),
    );
    if (memErr) throw new HttpError(500, memErr.message);

    // Same idempotent-thread pattern team-assembly/confirm.ts uses — not strictly reachable
    // twice here (the status gate above already refuses a re-selection), kept anyway so the
    // two code paths that create a team chat stay identical rather than one being "trusted"
    // to only run once and the other checking.
    const { data: existingThread, error: findThreadErr } = await supabaseAdmin
      .from("chat_threads")
      .select("id")
      .eq("context_type", "team")
      .eq("context_id", team.id)
      .maybeSingle();
    if (findThreadErr) throw new HttpError(500, findThreadErr.message);
    if (!existingThread) {
      const { data: titled, error: titleErr } = await supabaseAdmin
        .from("requests")
        .select("title")
        .eq("id", requestId)
        .maybeSingle();
      if (titleErr) throw new HttpError(500, titleErr.message);
      const { error: threadErr } = await supabaseAdmin
        .from("chat_threads")
        .insert({ context_type: "team", context_id: team.id, title: titled?.title ?? "Team" });
      if (threadErr) throw new HttpError(500, threadErr.message);
    }
  }

  res.status(200).json({ selected: providerIds.length });
});
