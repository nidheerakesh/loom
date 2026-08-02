import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { sessionByToken } from "../../_lib/auth.js";
import { mapProvider, mapCustomer } from "../../_lib/mappers.js";

const PROVIDER_COLS =
  "id, name, shop_name, available, capacity, rate, rate_unit, delivery_days, experience_years, rating, rating_count, languages, home_location_id, group_id";
const CUSTOMER_COLS = "id, name, company, location_id";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const s = token ? await sessionByToken(token) : null;
  if (!s) {
    res.status(200).json(null);
    return;
  }

  if (s.role === "provider") {
    const { data } = await supabaseAdmin.from("providers").select(PROVIDER_COLS).eq("id", s.userId).maybeSingle();
    res.status(200).json(data ? { role: s.role, userId: s.userId, provider: mapProvider(data) } : null);
    return;
  }
  if (s.role === "customer") {
    const { data } = await supabaseAdmin.from("customers").select(CUSTOMER_COLS).eq("id", s.userId).maybeSingle();
    res.status(200).json(data ? { role: s.role, userId: s.userId, customer: mapCustomer(data) } : null);
    return;
  }
  res.status(200).json({ role: s.role, userId: s.userId });
});
