import { supabaseAdmin } from "./supabase.js";
import { HttpError } from "./http.js";
import { distanceMap } from "./geo.js";
import { score, skillFit, type Score } from "./scoring.js";

// The same "best matching skill, then score()" computation matching/feed.ts does for a
// provider looking at every job — run here in the other direction, for a customer looking at
// every applicant on ONE job. Shared so interested-providers.ts (display) and
// auto-choose.ts (decision) can't quietly drift into two different definitions of "best
// applicant."
export async function scoreApplicants(
  requestId: string,
  requestLocationId: string,
  requestPay: number | null,
  candidates: { providerId: string; homeLocationId: string }[],
): Promise<Map<string, Score>> {
  const out = new Map<string, Score>();
  if (candidates.length === 0) return out;

  const { data: reqSkillRows, error: rsErr } = await supabaseAdmin
    .from("request_skills")
    .select("skill_id")
    .eq("request_id", requestId);
  if (rsErr) throw new HttpError(500, rsErr.message);
  const skillIds = (reqSkillRows ?? []).map((r) => r.skill_id);
  if (skillIds.length === 0) return out;

  const { data: psRows, error: psErr } = await supabaseAdmin
    .from("provider_skills")
    .select("provider_id, skill_id, proficiency")
    .in(
      "provider_id",
      candidates.map((c) => c.providerId),
    )
    .in("skill_id", skillIds);
  if (psErr) throw new HttpError(500, psErr.message);

  const bestProfByProvider = new Map<string, number>();
  for (const ps of psRows ?? []) {
    const cur = bestProfByProvider.get(ps.provider_id) ?? 0;
    if (ps.proficiency > cur) bestProfByProvider.set(ps.provider_id, ps.proficiency);
  }

  const distances = await distanceMap(
    requestLocationId,
    candidates.map((c) => c.homeLocationId),
  );

  for (const c of candidates) {
    const bestProf = bestProfByProvider.get(c.providerId) ?? 0;
    const dist = distances.get(c.homeLocationId) ?? Number.POSITIVE_INFINITY;
    out.set(c.providerId, score(skillFit(bestProf), dist, requestPay ?? undefined));
  }
  return out;
}
