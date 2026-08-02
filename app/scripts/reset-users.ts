import { clearTables, seedReference, USER_TABLES } from "./seedHelpers";

// Clear user-generated data (accounts, requests, teams, chat…), keep the reference catalogue
// (skills, geography) intact — a clean slate for creating real accounts.
// Run: npm run reset-users
// Pass --reference to also wipe and rebuild the reference catalogue itself (e.g. if it's
// corrupted, or the skill/geography seed data changed) — matches convex/admin.ts's `reset`;
// the default (no flag) matches its `clearUsers`.
async function main() {
  await clearTables(USER_TABLES);
  if (process.argv.includes("--reference")) {
    await seedReference();
    console.log("Cleared all user data, rebuilt reference catalogue + geography.");
  } else {
    console.log("Cleared all user data (reference catalogue kept).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
