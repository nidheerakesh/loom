import { mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { fnv1a as hash } from "./lib/text";
import { clearTables, seedReference, USER_TABLES } from "./lib/seedHelpers";

// FULL demo seed: reference + fake providers/customers/requests (for the scripted demo).
// For a clean slate to create your own accounts, use `admin:reset` instead.
// Run: npx convex run seed:run
export const run = mutation({
  args: {},
  handler: async (ctx) => {
    await clearTables(ctx, USER_TABLES);
    const { skillId, groupIds, locIds } = await seedReference(ctx);

    const skillPlans = [
      ["stitching", "cutting"],
      ["stitching", "packaging"],
      ["cutting", "packaging"],
      ["cooking", "craft"],
      ["stitching", "craft"],
      ["tutoring", "cooking"],
    ];
    const capacities = [1, 3, 4, 5];
    const providerIds: Id<"providers">[] = [];
    for (let i = 0; i < 40; i++) {
      const plan = skillPlans[i % skillPlans.length];
      const capacity = capacities[i % capacities.length];
      const isShop = capacity > 1;
      const pid = await ctx.db.insert("providers", {
        name: `Provider ${i + 1}`,
        shopName: isShop ? `Shop ${i + 1}` : undefined,
        phoneHash: hash("seedprovider" + i),
        available: true,
        capacity,
        rate: 300 + (i % 5) * 50,
        rateUnit: "piece",
        deliveryDays: 1 + (i % 4),
        experienceYears: 1 + (i % 8),
        rating: 3.5 + (i % 4) * 0.4,
        ratingCount: 5 + (i % 20),
        languages: ["ml"],
        homeLocationId: locIds[i % locIds.length],
        groupId: groupIds[i % groupIds.length],
      });
      providerIds.push(pid);
      for (const sName of plan) {
        await ctx.db.insert("providerSkills", {
          providerId: pid,
          skillId: skillId[sName],
          proficiency: 3 + (i % 3),
        });
      }
    }

    const customerIds: Id<"customers">[] = [];
    const custNames = ["Meera", "St. Mary's School", "Anil Traders"];
    for (let i = 0; i < custNames.length; i++) {
      customerIds.push(
        await ctx.db.insert("customers", {
          name: custNames[i],
          company: i === 1 ? "St. Mary's School" : undefined,
          phoneHash: hash("seedcustomer" + i),
          locationId: locIds[i % locIds.length],
        }),
      );
    }

    const indReq = await ctx.db.insert("requests", {
      title: "Blouse stitching",
      description: "Stitch one blouse",
      mode: "individual",
      units: 1,
      pay: 400,
      locationId: locIds[0],
      status: "open",
      customerId: customerIds[0],
    });
    await ctx.db.insert("requestSkills", { requestId: indReq, skillId: skillId["stitching"], quantity: 1 });

    const groupReq = await ctx.db.insert("requests", {
      title: "30 school uniform sets",
      description: "Cut, stitch and pack 30 school uniform sets",
      mode: "group",
      units: 30,
      pay: 15000,
      locationId: locIds[1],
      status: "open",
      customerId: customerIds[1],
    });
    for (const sName of ["cutting", "stitching", "packaging"]) {
      await ctx.db.insert("requestSkills", { requestId: groupReq, skillId: skillId[sName], quantity: 10 });
    }

    return { providers: providerIds.length, customers: customerIds.length, requests: 2 };
  },
});
