import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";

export default withHandler(async (_req: VercelRequest, res: VercelResponse) => {
  const { data, error } = await supabaseAdmin
    .from("skills")
    .select("id, canonical_name, canonical_name_ml")
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw new HttpError(500, error.message);
  res.status(200).json(
    (data ?? []).map((s) => ({
      _id: s.id,
      canonicalName: s.canonical_name,
      canonicalNameMl: s.canonical_name_ml ?? null,
    })),
  );
});
