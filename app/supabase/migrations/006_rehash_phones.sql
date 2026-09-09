-- 006_rehash_phones.sql
-- Documents the migration from fnv1a phone_hash to HMAC-SHA256 phone_hash.
--
-- fnv1a is a 32-bit non-cryptographic hash (8 hex chars), easily brute-forced across the
-- ~10^10 Indian phone number space.
-- HMAC-SHA256 with a secret salt produces a 256-bit cryptographic digest (64 hex chars).
--
-- The application code transparently migrates existing accounts on their next sign-in
-- or WhatsApp message, and scripts/rehash-phones.ts rehashes seeded accounts.
-- This file serves as the audit documentation for that transition.

-- The phone_hash columns in Postgres were already defined as `text`, so no DDL ALTER is required.
-- An index already exists on `providers.phone_hash`, `customers.phone_hash`, `otps.phone_hash`.
SELECT 1;
