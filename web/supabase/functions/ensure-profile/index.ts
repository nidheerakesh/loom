import { serviceClient, getUser, json, cors } from "../_shared/util.ts";

// Called after sign-in. Creates a provider/customer row for the auth user if missing,
// assigning a deterministic seeded location + group so they're matchable. Returns profile.
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await getUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { role } = await req.json();
  const db = serviceClient();

  if (role === "provider") {
    const { data: existing } = await db.from("providers").select("*").eq("user_id", user.id).maybeSingle();
    if (existing) return json({ role, profile: existing });
    const { data: locs } = await db.from("locations").select("id").order("label");
    const { data: groups } = await db.from("groups").select("id").order("name");
    const locId = locs?.length ? locs[hash(user.id) % locs.length].id : null;
    const grpId = groups?.length ? groups[hash("g" + user.id) % groups.length].id : null;
    const { data, error } = await db.from("providers").insert({
      user_id: user.id,
      name: user.user_metadata?.name ?? "New provider",
      home_location_id: locId,
      group_id: grpId,
    }).select("*").single();
    if (error) return json({ error: error.message }, 400);
    return json({ role, profile: data });
  }

  if (role === "customer") {
    const { data: existing } = await db.from("customers").select("*").eq("user_id", user.id).maybeSingle();
    if (existing) return json({ role, profile: existing });
    const { data: locs } = await db.from("locations").select("id").order("label");
    const locId = locs?.length ? locs[hash(user.id) % locs.length].id : null;
    const { data, error } = await db.from("customers").insert({
      user_id: user.id,
      name: user.user_metadata?.name ?? "New customer",
      location_id: locId,
    }).select("*").single();
    if (error) return json({ error: error.message }, 400);
    return json({ role, profile: data });
  }

  return json({ error: "bad role" }, 400);
});
