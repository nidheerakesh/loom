import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

const Body = z.object({ token: z.string().min(1), teamId: z.string().min(1) });

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, teamId } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id, request_id, rationale, complete")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr) throw new HttpError(500, teamErr.message);
  if (!team) throw new HttpError(404, "Team not found");

  // Confirming someone else's team would let any customer commit providers to work.
  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("customer_id")
    .eq("id", team.request_id)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request || request.customer_id !== s.userId) throw new HttpError(403, "Not your request");

  const { data: members, error: memErr } = await supabaseAdmin
    .from("team_members")
    .select("id, provider_id, assigned_skill_id, covered_units, state, seq")
    .eq("team_id", teamId)
    .order("seq", { ascending: true });
  if (memErr) throw new HttpError(500, memErr.message);

  const { error: teamUpdErr } = await supabaseAdmin
    .from("teams")
    .update({ status: "confirmed" })
    .eq("id", teamId);
  if (teamUpdErr) throw new HttpError(500, teamUpdErr.message);

  // Audit rows for the collective match. Only individual matches were ever logged (and only
  // when a provider opened one), so the team match — the headline capability — was the single
  // thing not traceable, against goal G4's "100% of narrations trace to a logged decision".
  const auditRows = (members ?? []).map((m) => ({
    type: "team" as const,
    provider_id: m.provider_id,
    request_id: team.request_id,
    score: {
      coveredUnits: m.covered_units,
      assignedSkillId: m.assigned_skill_id,
      complete: team.complete,
    },
    path: [["team", teamId], ["provider", m.provider_id], ["skill", m.assigned_skill_id]],
  }));
  if (auditRows.length > 0) {
    const { error: auditErr } = await supabaseAdmin.from("matches").insert(auditRows);
    if (auditErr) throw new HttpError(500, auditErr.message);
  }

  const { error: reqUpdErr } = await supabaseAdmin
    .from("requests")
    .update({ status: "assigned" })
    .eq("id", team.request_id);
  if (reqUpdErr) throw new HttpError(500, reqUpdErr.message);

  // A conversation for the people actually doing this job. The `team` context has existed in
  // the schema and in chatAccess since the beginning, but nothing ever created a thread for
  // it — so an assembled team had no way to coordinate, which is most of the point of
  // assembling one. Membership resolves from the team, so it follows accepts, declines and
  // replacements without any bookkeeping here.
  //
  // Idempotent: re-confirming must not produce a second thread.
  const { data: existingThread, error: findThreadErr } = await supabaseAdmin
    .from("chat_threads")
    .select("id")
    .eq("context_type", "team")
    .eq("context_id", teamId)
    .maybeSingle();
  if (findThreadErr) throw new HttpError(500, findThreadErr.message);

  if (!existingThread) {
    const { data: request, error: titleErr } = await supabaseAdmin
      .from("requests")
      .select("title")
      .eq("id", team.request_id)
      .maybeSingle();
    if (titleErr) throw new HttpError(500, titleErr.message);

    const { error: threadErr } = await supabaseAdmin
      .from("chat_threads")
      .insert({
        context_type: "team",
        context_id: teamId,
        title: request?.title ?? "Team",
      });
    if (threadErr) throw new HttpError(500, threadErr.message);
  }

  res.status(200).json(null);
});
