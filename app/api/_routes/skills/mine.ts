import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http";
import { supabaseAdmin } from "../../_lib/supabase";
import { sessionByToken } from "../../_lib/auth";

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const s = token ? await sessionByToken(token) : null;
  if (!s || s.role !== "provider") {
    res.status(200).json([]);
    return;
  }
  const { data, error } = await supabaseAdmin
    .from("provider_skills")
    .select("proficiency, skills(id, canonical_name, canonical_name_ml, icon_key)")
    .eq("provider_id", s.userId);
  if (error) throw new HttpError(500, error.message);
  res.status(200).json(
    (data ?? [])
      .map((row) => {
        const sk = row.skills as unknown as {
          id: string;
          canonical_name: string;
          canonical_name_ml: string | null;
          icon_key: string;
        } | null;
        if (!sk) return null;
        return {
          _id: sk.id,
          canonicalName: sk.canonical_name,
          canonicalNameMl: sk.canonical_name_ml ?? null,
          iconKey: sk.icon_key,
          proficiency: row.proficiency,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  );
});
