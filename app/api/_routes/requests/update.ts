import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireRole } from "../../_lib/auth.js";

const Body = z.object({
  token: z.string().min(1),
  requestId: z.string().min(1),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  units: z.number().int().positive().optional(),
  pay: z.number().nonnegative().optional(),
  deadline: z.string().optional(),
});

// Edit a request the customer has already posted — a typo in the title, a corrected unit
// count, a revised budget.
//
// Only while the work is still open. Once it is assigned, providers have arranged their time
// around the terms they agreed to, and silently changing the pay or the quantity underneath
// them is not an edit, it is a different job. Mode and skills are likewise not editable:
// changing them would invalidate the interest providers have already expressed, and posting a
// different kind of work is a new request.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId, ...patch } = Body.parse(req.body);
  const s = await requireRole(token, "customer");

  const { data: request, error: reqErr } = await supabaseAdmin
    .from("requests")
    .select("id, customer_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new HttpError(500, reqErr.message);
  if (!request) throw new HttpError(404, "Request not found");
  if (request.customer_id !== s.userId) throw new HttpError(403, "Not your request");
  if (request.status !== "open") {
    throw new HttpError(409, "This work can no longer be edited");
  }

  const fields: Record<string, unknown> = {};
  if (patch.title !== undefined) fields.title = patch.title;
  if (patch.description !== undefined) fields.description = patch.description;
  if (patch.units !== undefined) fields.units = patch.units;
  if (patch.pay !== undefined) fields.pay = patch.pay;
  if (patch.deadline !== undefined) fields.deadline = patch.deadline;
  if (Object.keys(fields).length === 0) {
    res.status(200).json(null);
    return;
  }

  const { error } = await supabaseAdmin.from("requests").update(fields).eq("id", requestId);
  if (error) throw new HttpError(500, error.message);

  res.status(200).json(null);
});
