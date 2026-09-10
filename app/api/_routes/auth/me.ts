import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { sessionByToken } from "../../_lib/auth.js";
import { mapProvider, mapCustomer } from "../../_lib/mappers.js";

const PROVIDER_COLS =
  "id, name, shop_name, available, capacity, rate, rate_unit, delivery_days, experience_years, rating, rating_count, languages, home_location_id, group_id";
const CUSTOMER_COLS = "id, name, company, location_id, location_confirmed";

// `me` is polled on essentially every screen (App.tsx drops the session and forces a
// re-sign-in the instant this resolves to `null`), which made an unchecked query error here
// specifically dangerous: a missing column — migration 011 landing on the schema but not
// actually reaching the database — silently became `data: null` and every real customer got
// logged out on every load, with nothing in the UI to say why. Checked and thrown now, so a
// schema problem surfaces as a 500 in the network tab instead of a mysterious redirect loop.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const s = token ? await sessionByToken(token) : null;
  if (!s) {
    res.status(200).json(null);
    return;
  }

  if (s.role === "provider") {
    const { data, error } = await supabaseAdmin.from("providers").select(PROVIDER_COLS).eq("id", s.userId).maybeSingle();
    if (error) throw new HttpError(500, error.message);
    res.status(200).json(data ? { role: s.role, userId: s.userId, provider: mapProvider(data) } : null);
    return;
  }
  if (s.role === "customer") {
    const { data, error } = await supabaseAdmin.from("customers").select(CUSTOMER_COLS).eq("id", s.userId).maybeSingle();
    if (error) throw new HttpError(500, error.message);
    res.status(200).json(data ? { role: s.role, userId: s.userId, customer: mapCustomer(data) } : null);
    return;
  }
  res.status(200).json({ role: s.role, userId: s.userId });
});
