import { supabaseAdmin } from "../api/_lib/supabase";
import { fnv1a as hash } from "../api/_lib/text";
import { clearTables, seedReference, USER_TABLES } from "./seedHelpers";

// FULL demo seed: reference + fake providers/customers/requests (for the scripted demo).
// For a clean slate to create your own accounts, use `reset-users.ts` instead.
// Run: npm run seed
// Ported from convex/seed.ts's `run`.
async function main() {
  await clearTables(USER_TABLES);
  const { skillId, groupIds, locIds } = await seedReference();

  const skillPlans = [
    ["stitching", "cutting"],
    ["stitching", "packaging"],
    ["cutting", "packaging"],
    ["cooking", "craft"],
    ["stitching", "craft"],
    ["tutoring", "cooking"],
  ];
  const capacities = [1, 3, 4, 5];
  const providerIds: string[] = [];
  for (let i = 0; i < 40; i++) {
    const plan = skillPlans[i % skillPlans.length];
    const capacity = capacities[i % capacities.length];
    const isShop = capacity > 1;
    const { data: p, error: pErr } = await supabaseAdmin
      .from("providers")
      .insert({
        name: `Provider ${i + 1}`,
        shop_name: isShop ? `Shop ${i + 1}` : null,
        phone_hash: hash("seedprovider" + i),
        available: true,
        capacity,
        rate: 300 + (i % 5) * 50,
        rate_unit: "piece",
        delivery_days: 1 + (i % 4),
        experience_years: 1 + (i % 8),
        rating: 3.5 + (i % 4) * 0.4,
        rating_count: 5 + (i % 20),
        languages: ["ml"],
        home_location_id: locIds[i % locIds.length],
        group_id: groupIds[i % groupIds.length],
      })
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);
    providerIds.push(p.id);
    const { error: psErr } = await supabaseAdmin
      .from("provider_skills")
      .insert(plan.map((sName) => ({ provider_id: p.id, skill_id: skillId[sName], proficiency: 3 + (i % 3) })));
    if (psErr) throw new Error(psErr.message);
  }

  const customerIds: string[] = [];
  const custNames = ["Meera", "St. Mary's School", "Anil Traders"];
  for (let i = 0; i < custNames.length; i++) {
    const { data: c, error } = await supabaseAdmin
      .from("customers")
      .insert({
        name: custNames[i],
        company: i === 1 ? "St. Mary's School" : null,
        phone_hash: hash("seedcustomer" + i),
        location_id: locIds[i % locIds.length],
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    customerIds.push(c.id);
  }

  const { data: indReq, error: indErr } = await supabaseAdmin
    .from("requests")
    .insert({
      title: "Blouse stitching",
      description: "Stitch one blouse",
      mode: "individual",
      units: 1,
      pay: 400,
      location_id: locIds[0],
      status: "open",
      customer_id: customerIds[0],
    })
    .select("id")
    .single();
  if (indErr) throw new Error(indErr.message);
  const { error: indSkillErr } = await supabaseAdmin
    .from("request_skills")
    .insert({ request_id: indReq.id, skill_id: skillId["stitching"], quantity: 1 });
  if (indSkillErr) throw new Error(indSkillErr.message);

  const { data: groupReq, error: groupErr } = await supabaseAdmin
    .from("requests")
    .insert({
      title: "30 school uniform sets",
      description: "Cut, stitch and pack 30 school uniform sets",
      mode: "group",
      units: 30,
      pay: 15000,
      location_id: locIds[1],
      status: "open",
      customer_id: customerIds[1],
    })
    .select("id")
    .single();
  if (groupErr) throw new Error(groupErr.message);
  const { error: groupSkillErr } = await supabaseAdmin
    .from("request_skills")
    .insert(["cutting", "stitching", "packaging"].map((sName) => ({ request_id: groupReq.id, skill_id: skillId[sName], quantity: 10 })));
  if (groupSkillErr) throw new Error(groupSkillErr.message);

  console.log(`Seeded ${providerIds.length} providers, ${customerIds.length} customers, 2 requests.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
