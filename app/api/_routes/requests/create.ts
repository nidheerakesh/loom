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
  units: z.number(),
  pay: z.number().optional(),
  deadline: z.string().optional(),
  skills: z.array(z.object({ skillId: z.string().min(1), quantity: z.number() })),
});

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, title, description, mode, units, pay, deadline, skills } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

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
