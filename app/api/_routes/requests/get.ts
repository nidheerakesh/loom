import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { requireSession } from "../../_lib/auth.js";

// Full detail for one request: description, pay, deadline, and the customer's name.
//
// This had NO authentication of any kind — anyone holding a request id could read all of it,
// customer name included, with no token. It was also the only route in the map with no UI
// caller, which is why it went unnoticed: nothing exercised it, so nothing revealed it.
//
// A signed-in user is the right bar rather than the owning customer alone: a provider deciding
// whether to apply needs the description and pay, and the work is offered to them. It is not
// public.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  await requireSession(token);

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
