import { supabaseAdmin } from "../api/_lib/supabase.js";
import { hashPhone, legacyPhoneHash } from "../api/_lib/text.js";
import { PROVIDERS, CUSTOMERS } from "./demoData.js";

// Rehash database records from legacy fnv1a to HMAC-SHA256.
// Safe and idempotent.
async function main() {
  console.log("Rehashing known seeded accounts...");
  let providerUpdated = 0;
  let customerUpdated = 0;

  for (let i = 0; i < PROVIDERS.length; i++) {
    const e164 = `+9198765${30001 + i}`;
    const oldHash = legacyPhoneHash(e164);
    const newHash = hashPhone(e164);

    const { data } = await supabaseAdmin
      .from("providers")
      .update({ phone_hash: newHash })
      .eq("phone_hash", oldHash)
      .select("id");
    if (data && data.length > 0) providerUpdated += data.length;
  }

  for (let i = 0; i < CUSTOMERS.length; i++) {
    const e164 = `+9198765${40001 + i}`;
    const oldHash = legacyPhoneHash(e164);
    const newHash = hashPhone(e164);

    const { data } = await supabaseAdmin
      .from("customers")
      .update({ phone_hash: newHash })
      .eq("phone_hash", oldHash)
      .select("id");
    if (data && data.length > 0) customerUpdated += data.length;
  }

  console.log(`Rehashed ${providerUpdated} providers, ${customerUpdated} customers.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
