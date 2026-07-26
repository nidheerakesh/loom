import { mutation } from "./_generated/server";
import { clearTables, seedReference, USER_TABLES } from "./lib/seedHelpers";

// Wipe EVERYTHING and rebuild only the reference catalogue + geography (no fake accounts).
// Clean slate for creating real accounts and data. Run: npx convex run admin:reset
export const reset = mutation({
  args: {},
  handler: async (ctx) => {
    await clearTables(ctx, USER_TABLES);
    await seedReference(ctx);
    return { cleared: "all user data", seeded: "reference catalogue + geography" };
  },
});

// Clear only user-generated data (accounts, requests, teams, chat…), keep reference.
export const clearUsers = mutation({
  args: {},
  handler: async (ctx) => {
    await clearTables(ctx, USER_TABLES);
    return { cleared: "all user data (reference kept)" };
  },
});
