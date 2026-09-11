import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

const Body = z.object({
  token: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  mode: z.enum(["individual", "group"]),
  // requests/update has always validated these and create never did, so an order could be
  // posted with zero, negative or fractional units and then refuse to be edited back into a
  // legal state. The ceiling is arbitrary but finite: far beyond any real SHG order, and it
  // stops a typo asking the assembler to cover a million pieces.
  units: z.number().int().positive().max(10000),
  pay: z.number().nonnegative().max(10_000_000).optional(),
  deadline: z.string().optional(),
  // Group orders only: how many people she wants. Optional even then — a customer who does
  // not want a cap still works exactly as before.
  headcount: z.number().int().positive().max(1000).optional(),
  // Any mode. When set, requests/respond.ts refuses an application after it passes and the
  // customer gets requests/auto-choose.ts — "let the algorithm decide" — once it has, instead
  // of only ever picking manually. Started as group-only; an individual job waiting on
  // applicants has exactly the same "when do I stop waiting" question a group order does.
  interestDeadline: z.string().datetime().optional(),
  // Group orders only. Who is accountable for this job (default: the customer herself), and
  // the single rate every team member is paid for it. All optional — an older client, or a
  // customer who doesn't want to set either up front, still works exactly as before.
  coordinatorProviderId: z.string().min(1).optional(),
  agreedRate: z.number().nonnegative().max(10_000_000).optional(),
  agreedRateUnit: z.string().max(40).optional(),
  skills: z.array(
    z.object({ skillId: z.string().min(1), quantity: z.number().int().positive().max(10000) }),
  ),
});

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const {
    token, title, description, mode, units, pay, deadline, headcount, interestDeadline,
    coordinatorProviderId, agreedRate, agreedRateUnit, skills,
  } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  // A coordinator provider must be real — checked here rather than left to the foreign key,
  // for the same reason set-coordinator.ts does: a route can say "that provider doesn't
  // exist", a constraint violation on the insert below can only say "insert failed".
  if (coordinatorProviderId) {
    const { data: coord, error: coordErr } = await supabaseAdmin
      .from("providers")
      .select("id")
      .eq("id", coordinatorProviderId)
      .maybeSingle();
    if (coordErr) throw new HttpError(500, coordErr.message);
    if (!coord) throw new HttpError(400, "That provider does not exist");
  }

  const { data: customer, error: custErr } = await supabaseAdmin
    .from("customers")
    .select("id, location_id")
    .eq("id", s.userId)
    .maybeSingle();
  if (custErr) throw new HttpError(500, custErr.message);
  if (!customer) throw new HttpError(404, "Customer not found");

  const { data: request, error: insErr } = await supabaseAdmin
    .from("requests")
    .insert({
      title,
      description,
      mode,
      units,
      pay,
      deadline,
      headcount: mode === "group" ? headcount : undefined,
      interest_deadline: interestDeadline,
      coordinator_role: mode === "group" && coordinatorProviderId ? "provider" : "customer",
      coordinator_provider_id: mode === "group" ? coordinatorProviderId : undefined,
      agreed_rate: mode === "group" ? agreedRate : undefined,
      agreed_rate_unit: mode === "group" ? agreedRateUnit : undefined,
      location_id: customer.location_id,
      status: "open",
      customer_id: customer.id,
    })
    .select("id")
    .single();
  if (insErr) throw new HttpError(500, insErr.message);

  if (skills.length > 0) {
    const { error: rsErr } = await supabaseAdmin
      .from("request_skills")
      .insert(skills.map((sk) => ({ request_id: request.id, skill_id: sk.skillId, quantity: sk.quantity })));
    if (rsErr) throw new HttpError(500, rsErr.message);
  }

  res.status(200).json({ requestId: request.id, teamSuggested: mode === "group" });
});
