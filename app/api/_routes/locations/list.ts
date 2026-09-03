import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";

// The areas a user can pick from when she will not, or cannot, share a GPS reading.
//
// Only named places are offered. Rows created from a raw reading are labelled with their own
// rounded coordinates, and a list of numbers is not a choice anybody can make — so they are
// filtered out rather than shown.
export default withHandler(async (_req: VercelRequest, res: VercelResponse) => {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id, label")
    .order("label", { ascending: true })
    .limit(200);
  if (error) throw new HttpError(500, error.message);

  const named = (data ?? []).filter((l) => !/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(l.label));
  res.status(200).json(named.map((l) => ({ _id: l.id, label: l.label })));
});
