import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { sessionByToken } from "../../_lib/auth.js";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const s = token ? await sessionByToken(token) : null;
  if (!s || s.role !== "provider") {
    res.status(200).json([]);
    return;
  }

  // One query with embedded joins, instead of three per membership row.
  const { data: rows, error } = await supabaseAdmin
    .from("team_members")
    .select(
      "team_id, covered_units, state, skills(canonical_name, canonical_name_ml), teams(id, status, requests(title, status))",
    )
    .eq("provider_id", s.userId);
  if (error) throw new HttpError(500, error.message);

  type Row = {
    team_id: string;
    covered_units: number;
    state: string;
    skills: { canonical_name: string; canonical_name_ml: string | null } | null;
    teams: { id: string; status: string; requests: { title: string; status: string } | null } | null;
  };

  const out = [];
  for (const m of (rows ?? []) as unknown as Row[]) {
    if (!m.teams) continue;
    // A proposed team is still the customer's draft — they may re-assemble or abandon it.
    // Showing it would let a provider accept a slot on work that was never committed, the
    // silent commitment USER_FLOWS §5 rules out.
    if (m.teams.status !== "confirmed") continue;
    out.push({
      teamId: m.teams.id,
      teamStatus: m.teams.status,
      // The REQUEST's status, not the team's. Marking work finished sets requests.status to
      // 'completed' and never touches teams.status, so a team member saw "Confirmed" forever
      // and was never told the job had ended.
      requestStatus: m.teams.requests?.status ?? null,
      requestTitle: m.teams.requests?.title ?? "",
      skill: m.skills?.canonical_name ?? "",
      skillMl: m.skills?.canonical_name_ml ?? null,
      coveredUnits: m.covered_units,
      state: m.state,
    });
  }
  res.status(200).json(out);
});
