import { HttpError } from "./http.js";
import { supabaseAdmin } from "./supabase.js";
import type { Session } from "./auth.js";

export type CoordinatedRequest = {
  id: string;
  customer_id: string;
  mode: string;
  status: string;
  coordinator_role: "customer" | "provider";
  coordinator_provider_id: string | null;
  coordinator_response: "pending" | "accepted" | "declined";
};

async function loadRequest(requestId: string): Promise<CoordinatedRequest> {
  const { data: request, error } = await supabaseAdmin
    .from("requests")
    .select("id, customer_id, mode, status, coordinator_role, coordinator_provider_id, coordinator_response")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!request) throw new HttpError(404, "Request not found");
  if (request.mode !== "group") throw new HttpError(400, "Only group orders have a coordinator");
  return request as CoordinatedRequest;
}

// The coordinator is whoever `coordinator_role` names: the request's own customer by default,
// or the specific provider the customer appointed. Used everywhere an action is the
// coordinator's alone — uploading a pattern, signing off — not everywhere the pattern is
// merely visible (requestPatternGetAccess below is the looser check for that).
export async function requireCoordinator(session: Session, requestId: string): Promise<CoordinatedRequest> {
  const request = await loadRequest(requestId);
  const isCoordinator =
    (request.coordinator_role === "customer" &&
      session.role === "customer" &&
      session.userId === request.customer_id) ||
    (request.coordinator_role === "provider" &&
      session.role === "provider" &&
      session.userId === request.coordinator_provider_id);
  if (!isCoordinator) throw new HttpError(403, "Only the coordinator can do this");
  // An appointed provider who hasn't accepted isn't coordinating anything yet — she can still
  // see the job (requirePatternViewer covers that), but pattern uploads and sign-off are
  // actions that commit her to the role, so they wait on her actually saying yes.
  if (request.coordinator_role === "provider" && request.coordinator_response !== "accepted") {
    throw new HttpError(409, "Accept the coordinator role before doing this", "coordinator-not-accepted");
  }
  return request;
}

// A pattern photo is a shared reference for the whole team, not the coordinator's private
// file — so reading it is scoped to "has a real reason to see this request" rather than
// "is the coordinator": the owning customer, or a provider who has expressed interest in it
// (open call) or been placed on a team for it (auto-assembly).
export async function requirePatternViewer(session: Session, requestId: string): Promise<CoordinatedRequest> {
  const request = await loadRequest(requestId);
  if (session.role === "customer") {
    if (session.userId !== request.customer_id) throw new HttpError(403, "Not your request");
    return request;
  }
  if (session.role === "provider") {
    const [interestRes, teamsRes] = await Promise.all([
      supabaseAdmin
        .from("interests")
        .select("id")
        .eq("request_id", requestId)
        .eq("provider_id", session.userId)
        .maybeSingle(),
      supabaseAdmin.from("teams").select("id").eq("request_id", requestId),
    ]);
    if (interestRes.error) throw new HttpError(500, interestRes.error.message);
    if (teamsRes.error) throw new HttpError(500, teamsRes.error.message);
    if (interestRes.data) return request;
    const teamIds = (teamsRes.data ?? []).map((t) => t.id);
    if (teamIds.length > 0) {
      const { data: member, error: memErr } = await supabaseAdmin
        .from("team_members")
        .select("id")
        .in("team_id", teamIds)
        .eq("provider_id", session.userId)
        .maybeSingle();
      if (memErr) throw new HttpError(500, memErr.message);
      if (member) return request;
    }
  }
  throw new HttpError(403, "Not part of this job");
}
