# Loom — Prototype Ready-For-Demo Plan

**Presentation: 16 August 2026.**

The good news, stated plainly so nobody spends tonight on the wrong thing: **the prototype is
built and deployed.** 78 automated checks pass against the live site, both matching modes work,
chat is private, the Malayalam interface loads. Nothing on this list is a feature.

What is left is **making the demo not embarrass the build**. Test rows are visible in the app,
the demo has never been rehearsed end to end on the presenting machine, and there is no fallback
if the venue wifi dies. Those are the three risks, in that order.

---

## Tonight — 90 minutes, two people

### A · Clean the data *(30 min, whoever has the Supabase credentials)*

The live database has test artefacts that a judge will see on screen.

| What | Where it shows | Fix |
|---|---|---|
| `probe`, `probe2` | closed already, but re-check the provider feed | verify gone |
| `DB connectivity probe` | provider "Find work" — an open request | close it, or delete the row |
| `loomtest reed weaving` | skill chips on Browse **and** the New Request form | delete from `skills` (+ its `skill_aliases`, `provider_skills`, `request_skills` rows) |
| 5 × `E2E bulk reed order` threads | provider Communities list | delete those `chat_threads` rows, or reseed |
| `Test Provider One/Two/Three`, `Test Customer One/Two` | Browse listings | harmless, but reseed removes them |

**The blunt option, which is also the best one if you have the credentials:**

```bash
cd app
npm run reset-users -- --reference   # wipes user data, rebuilds the clean 9-skill catalogue
npm run seed                          # 40 providers, 6 customers, 5 requests, ratings, chat
```

That gives a pristine demo database in two minutes. **It also deletes every account you have
created by hand**, so you re-create the demo accounts in step B — which you want to do anyway,
because that is the rehearsal.

**After reseeding, confirm the headline order still exists:** the customer's request list must
contain **30 school uniform sets** (group, 30 units, cutting + stitching + packaging). Section C
of the runbook depends on it.

### B · Rehearse the demo end to end *(45 min, the person who will drive it)*

Open `docs/DEMO_RUNBOOK.md` and walk **sections A, B and C**. Not reading — doing, on the
machine you will present from, with the windows arranged as they will be.

Then walk section C **three more times** until it is boring. C is the demo. If everything else
fails and C works, the pitch lands.

Things that will bite you, all of which have bitten us:

- **The OTP expires in 5 minutes.** If you request a code and then talk for six minutes, it will
  say `Code expired`. That is correct behaviour, not a bug — request a fresh one.
- **Polling is 7 seconds.** When you confirm a team and switch windows, the invitation takes up
  to seven seconds to appear. Do not tap frantically. Fill it: *"the other side polls every few
  seconds — there it is."*
- **Do not swap a member out and then check whether *that* member sees the invitation.** She
  correctly sees nothing. Use a member who stayed on the team.
- **Two browser windows, not two tabs.** Sessions live in `localStorage` per browser profile —
  use one normal window and one private window, or two profiles.

### C · Decide the demo device *(15 min)*

**Use a phone if you can mirror it.** The app is built for a phone, it looks right on a phone,
and — this matters — **your laptop probably has no Malayalam voice installed**, which means the
Listen button hides itself and you lose the voice beat entirely.

Check right now, on whatever you will present from:

1. Open the app, sign in, open a match, look for the Listen control.
2. If it is missing or shows text instead of speaking, the device has no `ml-IN` voice.
3. Android with Google TTS + the Malayalam pack installed will speak. Most laptops will not.

If no device speaks Malayalam: **record a 10-second screen capture of it speaking, on a device
that does**, and keep it as a slide. Then say the honest line from the script.

---

## Tomorrow morning — 45 minutes

### D · Fallbacks, in order of how likely you'll need them *(30 min)*

Venue wifi fails more often than software does. Prepare three layers:

1. **Phone hotspot**, tested, with the app loaded over it once so you know it works.
2. **A screen recording of the full demo** — 2 minutes, no audio, exactly the beats in the
   script. Record it tonight while rehearsing; it costs nothing extra. Put it on the laptop
   *and* on a phone.
3. **The screenshots** already in `docs/images/` as slides, in demo order: `01-signin` →
   `04-skill-readback` → `11-team-assembly` → `10-my-work` → `13-chat`.

If the live demo fails, switch to the recording **without narrating the failure**. Say "here it
is running" and continue. Judges forgive a network; they remember a team that panicked.

### E · Final checks *(15 min)*

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://loom-lovat-phi.vercel.app   # expect 200
cd app && node scripts/e2e.mjs                                              # expect 78/78
```

Then, by hand:

- [ ] Sign in as a fresh number → app opens **in Malayalam**
- [ ] Assemble the 30-uniform order → team spans **more than one group**
- [ ] Provider "My work" is empty before confirm, has the invitation after
- [ ] Browse shows real-looking names — no `probe`, no `Test Provider`
- [ ] New Request skill chips show 9 clean skills — no `loomtest reed weaving`
- [ ] Laptop charged, phone charged, hotspot on, deck exported as **PDF and PPTX**

---

## Not tonight

Deliberately excluded, because attempting any of these the night before a demo is how working
software becomes broken software:

- Speech-to-text
- Real GPS locations
- Admin surface
- Graph visualisation of the match
- Any refactor, however small

If you have spare energy, spend it on **rehearsing section C again**, not on code.

---

## Two things outside the app that still need doing

1. **Make the repository public.** `github.com/nidheerakesh/loom` is private. Every judge who
   opens it gets a 404, and the progress report links it three times. This is a two-click fix
   and it is the highest-value thing on this page.
2. **Fix the repo's website link.** It points at `loom-rho-seven.vercel.app`, which is dead. It
   should be `loom-lovat-phi.vercel.app`.

---

## Owner grid

| Task | Who | When | Done |
|---|---|---|---|
| A · Clean/reseed the database | *(needs Supabase creds)* | tonight | ☐ |
| B · Rehearse runbook A, B, C ×4 | demo driver | tonight | ☐ |
| B2 · Record the 2-min fallback video | demo driver | tonight | ☐ |
| C · Confirm Malayalam voice on the demo device | demo driver | tonight | ☐ |
| Slides 1–11 + backups | slide builder | tonight | ☐ |
| Script rehearsed aloud, timed, twice | speaker | tonight | ☐ |
| Repo made public | *(repo owner)* | tonight | ☐ |
| D · Hotspot + fallback slides ready | anyone | morning | ☐ |
| E · Final checks | all three, together | morning | ☐ |

---

## If you only do three things

1. **Reseed the database** — it removes every embarrassing string on screen in two minutes.
2. **Rehearse section C until it is boring** — it is the only part of the demo that matters.
3. **Make the repo public.**
