import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

const Body = z.object({
  token: z.string().min(1),
  teamId: z.string().min(1),
  providerId: z.string().min(1), // the member being replaced
  replacementId: z.string().min(1),
});

// Replace one member of a proposed team, keeping their skill and unit allocation.
//
// Only before confirmation: after that, providers have been invited and may have accepted, so
// swapping someone out silently would revoke work they had already agreed to.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, teamId, providerId, replacementId } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  if (providerId === replacementId) throw new HttpError(400, "That is the same provider");

  const { data: team, error: teamErr } = await supabaseAdmin
    .from("teams")
    .select("id, request_id, status")
    .eq("id", teamId)
    .maybeSingle();
  if (teamErr) throw new HttpError(500, teamErr.message);
  if (!team) throw new HttpError(404, "Team not found");
  if (team.status !== "proposed") {
    throw new HttpError(409, "This team is already confirmed and cannot be changed");
  }

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("customer_id")
    .eq("id", team.request_id)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request || request.customer_id !== s.userId) throw new HttpError(403, "Not your request");

  const { data: member, error: memErr } = await supabaseAdmin
    .from("team_members")
    .select("id, assigned_skill_id, covered_units")
    .eq("team_id", teamId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (memErr) throw new HttpError(500, memErr.message);
  if (!member) throw new HttpError(404, "That provider is not on this team");

  // The replacement must actually be able to do the work, and be free to take it — the
  // customer is choosing from a list, but the list is not the authority here.
  const [skillRes, provRes, dupeRes] = await Promise.all([
    supabaseAdmin
      .from("provider_skills")
      .select("proficiency")
      .eq("provider_id", replacementId)
      .eq("skill_id", member.assigned_skill_id)
      .maybeSingle(),
    supabaseAdmin
      .from("providers")
      .select("id, available, capacity")
      .eq("id", replacementId)
      .maybeSingle(),
    supabaseAdmin
      .from("team_members")
      .select("id")
      .eq("team_id", teamId)
      .eq("provider_id", replacementId)
      .maybeSingle(),
  ]);
  if (skillRes.error) throw new HttpError(500, skillRes.error.message);
  if (provRes.error) throw new HttpError(500, provRes.error.message);
  if (dupeRes.error) throw new HttpError(500, dupeRes.error.message);

  if (!skillRes.data) throw new HttpError(400, "That provider does not have the required skill");
  if (!provRes.data?.available) throw new HttpError(400, "That provider is not available");
  if (dupeRes.data) throw new HttpError(409, "That provider is already on this team");
  if (provRes.data.capacity < member.covered_units) {
    throw new HttpError(400, "That provider cannot cover this many units");
  }

  const { error } = await supabaseAdmin
    .from("team_members")
    .update({ provider_id: replacementId })
    .eq("id", member.id);
  if (error) throw new HttpError(500, error.message);

  res.status(200).json(null);
});
