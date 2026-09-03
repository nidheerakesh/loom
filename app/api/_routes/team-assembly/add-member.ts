import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";
import { recomputeCoverage, shortfallFor } from "../../_lib/teamCoverage.js";

const Body = z.object({
  token: z.string().min(1),
  teamId: z.string().min(1),
  providerId: z.string().min(1),
  skillId: z.string().min(1),
  units: z.number().int().positive().optional(),
});

// Put somebody on a team the engine did not pick.
//
// The assembler optimises for coverage and proximity. It does not know that the customer worked
// with this woman last year, or that she is the only one in the village with a working machine.
// So the engine advises and the customer decides — the same principle behind swap-member, and
// behind the customer choosing between applicants on individual work.
//
// Three constraints hold regardless of what the customer wants, because they are promises made
// to the provider rather than preferences of the customer:
//
//   she must actually have the skill      — the order needs doing, not just staffing
//   never more units than she declared    — capacity is what she said she can deliver
//   never more than the order still needs — the alternative is quietly paying for surplus
//
// Adding to a confirmed team is allowed and sends her an invitation immediately, which is how
// a customer fills a slot left by somebody who declined. She still has to accept.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, teamId, providerId, skillId, units } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id, request_id, status")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr) throw new HttpError(500, teamErr.message);
  if (!team) throw new HttpError(404, "Team not found");

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("customer_id")
    .eq("id", team.request_id)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request || request.customer_id !== s.userId) throw new HttpError(403, "Not your request");

  const { data: already, error: dupErr } = await supabaseAdmin
    .from("team_members")
    .select("id")
    .eq("team_id", teamId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (dupErr) throw new HttpError(500, dupErr.message);
  if (already) throw new HttpError(409, "She is already on this team");

  const [provRes, skillRes] = await Promise.all([
    supabaseAdmin
      .from("providers")
      .select("id, capacity, available")
      .eq("id", providerId)
      .maybeSingle(),
    supabaseAdmin
      .from("provider_skills")
      .select("proficiency")
      .eq("provider_id", providerId)
      .eq("skill_id", skillId)
      .maybeSingle(),
  ]);
  if (provRes.error) throw new HttpError(500, provRes.error.message);
  if (skillRes.error) throw new HttpError(500, skillRes.error.message);
  if (!provRes.data) throw new HttpError(404, "No such provider");
  if (!provRes.data.available) throw new HttpError(409, "She is not available for work");
  if (!skillRes.data) throw new HttpError(400, "She does not list that skill");

  const remaining = await shortfallFor(teamId, skillId);
  if (remaining <= 0) throw new HttpError(409, "That skill is already covered");

  const give = Math.min(units ?? remaining, remaining, provRes.data.capacity);
  if (give <= 0) throw new HttpError(400, "That would assign her no work");

  const { error: insErr } = await supabaseAdmin.from("team_members").insert({
    team_id: teamId,
    provider_id: providerId,
    assigned_skill_id: skillId,
    covered_units: give,
    // Same state assemble.ts writes. On a draft team nothing is shown to her; on a confirmed
    // team my-teams surfaces it and she decides for herself.
    state: "invited",
  });
  if (insErr) throw new HttpError(500, insErr.message);

  const { complete, rationale } = await recomputeCoverage(teamId);
  res.status(200).json({ assignedUnits: give, complete, rationale });
});
