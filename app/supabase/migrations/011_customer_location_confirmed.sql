-- Providers get a mandatory first-run location prompt (Onboarding.tsx), so the hash-assigned
-- location pickLocationId gives every fresh account gets overwritten with a real one almost
-- immediately. Customers never got the equivalent prompt — LocationPicker exists on their
-- Profile screen, but nothing routes a new signup through it, so her location stays whatever
-- the phone-number hash happened to land on: a real area, just not necessarily anywhere near
-- her, producing distances (to providers actually nearby) that are simply wrong.
--
-- location_confirmed distinguishes "she has told us where she is" from "a hash picked
-- somewhere for her" — CustomerApp.tsx gates on it the same way ProviderApp already gates on
-- an empty skill list.
alter table customers add column location_confirmed boolean not null default false;

-- Grandfather every existing customer (seeded demo data included) so this doesn't re-prompt
-- accounts that already have a location that's fine for the story it's telling — only new
-- signups from here on default to false.
update customers set location_confirmed = true;
