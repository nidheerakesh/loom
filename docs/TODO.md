# Loom — what's left

Ordered by what blocks what. Everything above the line has to be true before a real woman
signs up; everything below can ship while the pilot runs.

---

## Only you can do these

Everything else on this page I can build. These need a console, a card, a person, or a decision.
Ordered by what unblocks the most.

### Tonight
- [ ] **Meta WhatsApp setup** — `docs/WHATSAPP-SETUP.md`, steps 1–8. ~20 min, free
- [ ] **`SARVAM_API_KEY`** in Vercel — ₹1,000 free credit, and it turns on *both* speech
      directions at once. Without it voice notes are refused and the Listen button falls back to
      the device
- [ ] **Make the repository public** — two clicks; three links in the report 404 today
- [ ] **Fix the deck**: slide 06 says RLS caused the 1.35s and claims zero vulnerabilities.
      Neither is true. Slides 02 and 03 cite sources that do not exist

### Before she signs up
- [ ] **Twilio** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`.
      Free trial credit is plenty. Until this exists, knowing her number is enough to become her
- [ ] **Decide: does she see the seeded demo data?** A real woman applying to a fake order that
      nobody answers is a worse first experience than an empty app. Either give her a real
      customer with a real order, or say the word and I will clear production
- [ ] **Rotate the Supabase anon key** — it was public while the permissive policies existed
- [ ] **Stop the database pausing** — it already died once and took the app with it. Paid tier,
      or a scheduled ping plus an alert that reaches a person

### Tomorrow, with the SIM
- [ ] Add the number in WhatsApp Manager, verify by SMS, update `WHATSAPP_PHONE_NUMBER_ID`
- [ ] **Do not install WhatsApp on the new SIM first**

### Things that unblock me
- [ ] **Her real area names** — the pilot cluster's actual places. I will seed them; right now
      every distance is measured against invented Ernakulam geography
- [ ] **`ADMIN_PHONES`** in Vercel — any number. The moderation screen is built and shut
- [ ] **Whether `004_perf_indexes.sql` was ever applied** — I cannot see the database. If not,
      run it; the `seq` columns the deterministic tiebreak sorts by may be unindexed

### Nobody can do for you
- [ ] The coordinator conversation
- [ ] Sitting with her while she uses it, and not helping
- [ ] Writing down what success means before you see the data

---

## 🔴 Blocking — before a single real user

### 1 · Turn on real OTP delivery
**Anyone can currently sign in as anyone.** With Twilio unconfigured, `request-otp` returns the
code in its own response and the app prints it on screen. That is correct for a demo and a
catastrophic account-takeover hole the moment the accounts belong to real people — knowing a
woman's phone number is enough to become her.

- Configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`
- Confirm `devCode` is `null` in the response, on production
- Keep `OTP_TEST_NUMBERS` for the demo accounts only

### 2 · Hash phone numbers properly
`fnv1a` is a fast non-cryptographic hash. It is reversible by brute force over the ~10^10 Indian
mobile space in seconds, so today the database effectively stores plaintext numbers.

- Move to HMAC-SHA256 with a secret salt, or Argon2
- Needs a migration that rehashes existing rows, and every lookup site changed together
  (`request-otp`, `verify-otp`, `accounts.ts`, `whatsapp/webhook.ts`, `seed.ts`)

### 3 · Rotate the Supabase anon key
It was public while the permissive RLS policies existed. Policies are gone; the key has not
been rotated.

### 4 · Consent and a data policy, in Malayalam
Collecting name, phone, location, skills and ratings from women. Before real data:
- What is stored, why, and who can see it — one screen, plain Malayalam
- Explicit consent at signup
- A way to delete an account and its data

### 5 · Stop the database pausing
Supabase free tier paused the project once already and took the whole app down with it. With
real users that is an outage nobody is watching for.
- Paid tier, or a scheduled ping, plus an uptime alert that reaches a person

---

## 🟡 Pilot — getting the first real users

### 6 · Pick the cluster and get the coordinator
One CDS. The coordinator is the introduction; cold-onboarding individual women does not work.

### 7 · Replace placeholder geography
Locations are Ernakulam labels invented for the demo. The pilot cluster's real areas need
seeding, or every distance is wrong in a new way.

### 8 · Real WhatsApp number
Meta Business verification, not the sandbox and not the console. Days of paperwork, so start it
before it is needed.

### 9 · Sit with the first five women
Watch, do not instruct. The questions to answer: does she get past sign-in alone, does she
understand what "invited" means, does she trust it enough to accept.

### 10 · Decide what success means, before seeing the data
Orders fulfilled and income per provider — not signups. Write the numbers down first.

### 11 · Somebody answers when it breaks
A support number that reaches a human, and a named person who reads the grievance queue.

---

## 🟢 Product — after the pilot starts

### 12 · Turn on a speech key
Speech in and out are **built**; neither has a key. Until one exists the app uses the device
voice as before, and a WhatsApp voice note is answered with "please type instead".

One key switches both on:
- `SARVAM_API_KEY` — Indian, handles Manglish, ₹1,000 free credit, works today
- or `BHASHINI_API_KEY` + `BHASHINI_USER_ID` — government, free, better Malayalam, more setup

Then send a voice note to the bot and it answers.

### 13 · Fair rotation
Right now the highest-rated nearby provider wins repeatedly, which concentrates income in a
system built to spread it. This is the exploitation risk we would be asked about, and we have no
answer yet.

### 14 · WhatsApp: registration and notifications
A woman who is not registered is told to go to the website — which is the wall this channel
exists to remove. Signing up over WhatsApp needs no stored conversation state: what is missing
from her account *is* the state. Notifications need outbound credentials, so the trigger logic
can be built before the number exists.

### 15 · "Add member" has a route but no button
`team-assembly/add-member` is built and tested; only Remove and Replace are wired into the
screen. A customer cannot yet add somebody the engine did not pick.

### 16 · Backfill delivery days
Now collected at onboarding, but every provider who signed up before it exists has none.

### 17 · Graph view of the match justification
The last item from the original design that is still text-only.

---

## ⚪ Housekeeping

- [ ] Make the repository public — three links in the report 404 today
- [ ] Repo homepage points at `loom-rho-seven.vercel.app`, which is dead
- [ ] Confirm `004_perf_indexes.sql` was ever applied — `seq` columns may still be unindexed
- [ ] Collapse the duplicated feed query in `whatsapp/webhook.ts` into the shared one
- [ ] Deck: slide 06 states RLS caused the 1.35s and claims zero vulnerabilities. Neither is true
- [ ] Deck: slides 02 and 03 cite sources that do not exist

---

## Done

GPS with a manual fallback and grid-snapped storage · delivery days at onboarding · add/remove
team members with coverage recomputation · admin moderation surface · WhatsApp on two networks,
now including team invitations answered in Malayalam · 103 automated checks against production
