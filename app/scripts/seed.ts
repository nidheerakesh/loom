import { supabaseAdmin } from "../api/_lib/supabase.js";
import { fnv1a as hash } from "../api/_lib/text.js";
import { clearTables, seedReference, USER_TABLES } from "./seedHelpers.js";
import { PROVIDERS, PORTFOLIO_CAPTIONS, RATING_COMMENTS, CUSTOMERS, REQUESTS, CHAT } from "./demoData.js";

// FULL demo seed: reference data + the demo providers/customers/requests/chat in demoData.ts.
// DESTRUCTIVE — clears every user table first (including `sessions`, so everyone currently
// signed in is logged out). For a clean slate that keeps your own account, use reset-users.ts.
// Run: npm run seed
async function main() {
  await clearTables(USER_TABLES);
  const { skillId, groupIds, locIds } = await seedReference();

  // --- providers ------------------------------------------------------------------------
  const providerIds: string[] = [];
  for (let i = 0; i < PROVIDERS.length; i++) {
    const p = PROVIDERS[i];
    // Ratings are recomputed from the `ratings` rows below; seed a plausible aggregate so
    // listings look populated even for providers with no individual review attached.
    const rating = 3.6 + ((i * 7) % 14) / 10;
    const { data: row, error } = await supabaseAdmin
      .from("providers")
      .insert({
        name: p.name,
        shop_name: p.shopName,
        phone_hash: hash("seedprovider" + i),
        available: i % 11 !== 0, // a few unavailable, so the availability filter has an effect
        capacity: p.capacity,
        rate: p.rate,
        rate_unit: p.rateUnit,
        delivery_days: p.deliveryDays,
        experience_years: p.experienceYears,
        rating: Math.round(rating * 10) / 10,
        rating_count: 4 + ((i * 3) % 21),
        languages: ["ml"],
        home_location_id: locIds[i % locIds.length],
        group_id: groupIds[i % groupIds.length],
      })
      .select("id")
      .single();
    if (error) throw new Error(`provider ${p.name}: ${error.message}`);
    providerIds.push(row.id);

    const { error: psErr } = await supabaseAdmin.from("provider_skills").insert(
      p.skills.map((s, n) => ({
        provider_id: row.id,
        skill_id: skillId[s],
        proficiency: n === 0 ? 4 + (i % 2) : 3 + (i % 2), // primary skill graded higher
      })),
    );
    if (psErr) throw new Error(`provider_skills ${p.name}: ${psErr.message}`);
  }

  // --- portfolios -----------------------------------------------------------------------
  // storage_id is null: these are caption-only entries. The portfolio screen renders the
  // caption list without them; real images arrive via api/providers/portfolio/upload-url.ts.
  const portfolioRows = PORTFOLIO_CAPTIONS.map((caption, i) => ({
    provider_id: providerIds[i],
    storage_id: null,
    caption,
  }));
  const { error: pfErr } = await supabaseAdmin.from("portfolio_items").insert(portfolioRows);
  if (pfErr) throw new Error(`portfolio_items: ${pfErr.message}`);

  // --- customers ------------------------------------------------------------------------
  const customerIds: string[] = [];
  for (let i = 0; i < CUSTOMERS.length; i++) {
    const c = CUSTOMERS[i];
    const { data: row, error } = await supabaseAdmin
      .from("customers")
      .insert({
        name: c.name,
        company: c.company,
        phone_hash: hash("seedcustomer" + i),
        location_id: locIds[i % locIds.length],
      })
      .select("id")
      .single();
    if (error) throw new Error(`customer ${c.name}: ${error.message}`);
    customerIds.push(row.id);
  }

  // --- ratings --------------------------------------------------------------------------
  const ratingRows = RATING_COMMENTS.map((r, i) => ({
    provider_id: providerIds[i],
    customer_id: customerIds[i % customerIds.length],
    stars: r.stars,
    comment: r.comment,
  }));
  const { error: rErr } = await supabaseAdmin.from("ratings").insert(ratingRows);
  if (rErr) throw new Error(`ratings: ${rErr.message}`);

  // --- requests -------------------------------------------------------------------------
  const requestIds: string[] = [];
  for (const r of REQUESTS) {
    const { data: row, error } = await supabaseAdmin
      .from("requests")
      .insert({
        title: r.title,
        description: r.description,
        mode: r.mode,
        units: r.units,
        pay: r.pay,
        location_id: locIds[r.locationIndex],
        status: r.status,
        customer_id: customerIds[r.customerIndex],
      })
      .select("id")
      .single();
    if (error) throw new Error(`request ${r.title}: ${error.message}`);
    requestIds.push(row.id);

    const { error: rsErr } = await supabaseAdmin
      .from("request_skills")
      .insert(r.skills.map((s) => ({ request_id: row.id, skill_id: skillId[s.name], quantity: s.quantity })));
    if (rsErr) throw new Error(`request_skills ${r.title}: ${rsErr.message}`);
  }

  // --- interests ------------------------------------------------------------------------
  // A few providers have already expressed interest in the open group order, so the
  // customer's "interested providers" screen is not empty.
  const { error: iErr } = await supabaseAdmin.from("interests").insert(
    [0, 2, 5, 15].map((n) => ({ provider_id: providerIds[n], request_id: requestIds[1], state: "interested" as const })),
  );
  if (iErr) throw new Error(`interests: ${iErr.message}`);

  // --- chat -----------------------------------------------------------------------------
  const { data: thread, error: tErr } = await supabaseAdmin
    .from("chat_threads")
    .insert({ context_type: "request", context_id: requestIds[1], title: CHAT.title })
    .select("id")
    .single();
  if (tErr) throw new Error(`chat_thread: ${tErr.message}`);

  const { error: mErr } = await supabaseAdmin.from("messages").insert(
    CHAT.messages.map((m) => ({
      thread_id: thread.id,
      sender_id: m.role === "provider" ? providerIds[2] : customerIds[1],
      sender_role: m.role,
      body: m.body,
      read_at: null,
    })),
  );
  if (mErr) throw new Error(`messages: ${mErr.message}`);

  console.log(
    `Seeded ${providerIds.length} providers, ${customerIds.length} customers, ` +
      `${requestIds.length} requests, ${portfolioRows.length} portfolio items, ` +
      `${ratingRows.length} ratings, ${CHAT.messages.length} chat messages.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
