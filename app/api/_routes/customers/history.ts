import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withHandler, HttpError } from "../../_lib/http.js";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { sessionByToken } from "../../_lib/auth.js";

// "People you've worked with" — providers who accepted this customer's requests
// or joined a confirmed team for one. Ported from convex/customers.ts's `history`.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const s = token ? await sessionByToken(token) : null;
  if (!s || s.role !== "customer") {
    res.status(200).json([]);
    return;
  }

  const { data: requests, error: reqErr } = await supabaseAdmin.from("requests").select("id").eq("customer_id", s.userId);
  if (reqErr) throw new HttpError(500, reqErr.message);
  const requestIds = (requests ?? []).map((r) => r.id);

  const providerIds = new Set<string>();
  if (requestIds.length > 0) {
    const { data: interests, error: intErr } = await supabaseAdmin
      .from("interests")
      .select("provider_id, state, request_id")
      .in("request_id", requestIds)
      .eq("state", "accepted");
    if (intErr) throw new HttpError(500, intErr.message);
    for (const i of interests ?? []) providerIds.add(i.provider_id);

    const { data: teams, error: teamErr } = await supabaseAdmin.from("teams").select("id").in("request_id", requestIds);
    if (teamErr) throw new HttpError(500, teamErr.message);
    const teamIds = (teams ?? []).map((t) => t.id);
    if (teamIds.length > 0) {
      const { data: members, error: memErr } = await supabaseAdmin
        .from("team_members")
        .select("provider_id, state")
        .in("team_id", teamIds)
        .eq("state", "accepted");
      if (memErr) throw new HttpError(500, memErr.message);
      for (const m of members ?? []) providerIds.add(m.provider_id);
    }
  }

  if (providerIds.size === 0) {
    res.status(200).json([]);
    return;
  }
  const { data: providers, error: provErr } = await supabaseAdmin
    .from("providers")
    .select("id, name, shop_name, rating")
    .in("id", [...providerIds]);
  if (provErr) throw new HttpError(500, provErr.message);

  res.status(200).json(
    (providers ?? []).map((p) => ({ _id: p.id, name: p.name, shopName: p.shop_name ?? null, rating: p.rating })),
  );
});
