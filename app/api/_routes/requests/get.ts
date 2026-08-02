import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const requestId = typeof req.query.requestId === "string" ? req.query.requestId : undefined;
  if (!requestId) throw new HttpError(400, "requestId required");

  const { data: r, error } = await supabaseAdmin
    .from("requests")
    .select("id, title, description, mode, units, pay, deadline, status, customer_id")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!r) {
    res.status(200).json(null);
    return;
  }

  const { data: reqSkills, error: rsErr } = await supabaseAdmin
    .from("request_skills")
    .select("quantity, skills(id, canonical_name, canonical_name_ml)")
    .eq("request_id", requestId);
  if (rsErr) throw new HttpError(500, rsErr.message);

  const { data: customer, error: custErr } = await supabaseAdmin
    .from("customers")
    .select("name")
    .eq("id", r.customer_id)
    .maybeSingle();
  if (custErr) throw new HttpError(500, custErr.message);

  const skills = (reqSkills ?? [])
    .map((rs) => {
      const sk = rs.skills as unknown as { id: string; canonical_name: string; canonical_name_ml: string | null } | null;
      if (!sk) return null;
      return { _id: sk.id, canonicalName: sk.canonical_name, canonicalNameMl: sk.canonical_name_ml ?? null, quantity: rs.quantity };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  res.status(200).json({
    _id: r.id,
    title: r.title,
    description: r.description,
    mode: r.mode,
    units: r.units,
    pay: r.pay ?? null,
    deadline: r.deadline ?? null,
    status: r.status,
    customerName: customer?.name ?? null,
    skills,
  });
});
