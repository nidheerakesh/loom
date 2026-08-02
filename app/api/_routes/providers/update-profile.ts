import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler } from "../../_lib/http";
import { supabaseAdmin } from "../../_lib/supabase";
import { requireRole } from "../../_lib/auth";

const Body = z.object({
  token: z.string().min(1),
  name: z.string().optional(),
  shopName: z.string().optional(),
  capacity: z.number().optional(),
  rate: z.number().optional(),
  rateUnit: z.string().optional(),
  deliveryDays: z.number().optional(),
  experienceYears: z.number().optional(),
  languages: z.array(z.string()).optional(),
  available: z.boolean().optional(),
});

const COLUMN: Record<string, string> = {
  name: "name",
  shopName: "shop_name",
  capacity: "capacity",
  rate: "rate",
  rateUnit: "rate_unit",
  deliveryDays: "delivery_days",
  experienceYears: "experience_years",
  languages: "languages",
  available: "available",
};

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, ...rest } = Body.parse(req.body);
  const s = await requireRole(token, "provider");

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined) patch[COLUMN[k]] = v;
  }
  if (Object.keys(patch).length > 0) {
    await supabaseAdmin.from("providers").update(patch).eq("id", s.userId);
  }
  res.status(200).json(null);
});
