import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../_lib/http";
import { supabaseAdmin } from "../_lib/supabase";
import { requireRole } from "../_lib/auth";

const Body = z.object({ token: z.string().min(1), requestId: z.string().min(1), accept: z.boolean() });

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, requestId, accept } = Body.parse(req.body);
  const s = await requireRole(token, "provider");
  const state = accept ? "accepted" : "declined";

  const { data: existing, error: findErr } = await supabaseAdmin
    .from("interests")
    .select("id")
    .eq("provider_id", s.userId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (findErr) throw new HttpError(500, findErr.message);

  if (existing) {
    const { error } = await supabaseAdmin.from("interests").update({ state }).eq("id", existing.id);
    if (error) throw new HttpError(500, error.message);
  } else {
    const { error } = await supabaseAdmin.from("interests").insert({ provider_id: s.userId, request_id: requestId, state });
    if (error) throw new HttpError(500, error.message);
  }

  if (accept) {
    const { data: r, error: reqErr } = await supabaseAdmin
      .from("requests")
      .select("id, mode, status")
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr) throw new HttpError(500, reqErr.message);
    if (r && r.mode === "individual" && r.status === "open") {
      const { error } = await supabaseAdmin.from("requests").update({ status: "assigned" }).eq("id", requestId);
      if (error) throw new HttpError(500, error.message);
    }
  }
  res.status(200).json(null);
});
