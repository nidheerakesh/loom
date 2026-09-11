# Loom — Demo Video Script (3 devices, 3 people)

For recording the submission video. ~5 minutes total. Three people, three devices, each
screen-recorded separately and cut together — don't try to film phones on camera, screen
recordings edit cleaner and read better on a projector/YouTube.

**Roles:**
- **Nidhi** — customer (laptop, screen-recorded). Drives the main narrative, most voiceover.
- **Anjana** — provider #1 (phone A, screen-recorded).
- **Niveditha** — provider #2 (phone B, screen-recorded) → switches to Telegram on the same
  phone for section 6.

**Before recording:**
1. Run `node scripts/demo-preflight.mjs` — confirms all demo accounts sign in and the seeded
   order is still `open`.
2. Each person starts their own screen recording (phone: built-in screen recorder; laptop:
   QuickTime/OBS) — don't try to record all three live in one take. Slate each clip ("Nidhi —
   customer", "Anjana — provider A", "Niveditha — provider B / Telegram") so they're easy to
   find in the edit.
3. Narration can be recorded live while screen-recording (headset mic) or dubbed in post — live
   is faster if everyone's comfortable talking while tapping.
4. Use the **real demo accounts** (Sr. Alphonsa, Sheeba Thomas, Sumangala Pillai) — do not tap
   "Assemble" more than once; it can't be undone. If you need a retake of that specific beat,
   reseed (`npm run seed`) first.

Timestamps are targets, not hard cues — pace to what feels natural, then trim in editing.

---

## 0:00–0:20 — Cold open (Nidhi, laptop)

**Screen:** landing page.
**Say:** "This is Loom — a matching engine for Kudumbashree self-help groups in Kerala.
4.5 million women, real skills, real credit — no local market. We built the market."

Switch language toggle ML→EN once, on camera, to show it's real, not a screenshot.

## 0:20–1:30 — Individual job: post, apply, decide (Nidhi + Anjana)

**Nidhi (laptop):** Sign in as Sr. Alphonsa (code shows on screen — no waiting on SMS, say so).
Post an individual job: "Stitch 2 blouses", pick `stitching`, ₹400.
**Say:** "One thing to notice — she's not limited to a preset skill list." Type a new skill
phrase in the box, show it resolve/translate live.

**Anjana (phone A), cut in:** Sign in as Sheeba Thomas, open Browse, find the job.
**Say:** "This ranking isn't a black box — it's one formula: skill fit, distance, pay,
weighted. Same formula on the app and on the WhatsApp bot." Apply.

**Nidhi (laptop):** Back on Accepted → "Choose provider (1)". Point at the score/distance on
the card. Tap **Auto select** — show the preview card (name + score, Finalize/Cancel) —
**say:** "It previews who it would pick before anything's decided — nothing commits until I
tap Finalize." Tap Finalize. Card now reads **"Assigned to: Sheeba Thomas"**.

## 1:30–2:15 — Group order: auto-assembly (Nidhi)

**Nidhi (laptop):** Open the seeded "30 school uniform sets" order. Tap **Assemble**.
**Say:** "This is a real algorithm — greedy, capacity-aware set cover across SHGs — not a
single-provider pick. It states its own coverage, honestly, not just yes or no." Tap
**Confirm** — a team chat is created automatically for exactly the people on it.

## 2:15–3:00 — Coordinator + community chat (Niveditha)

**Niveditha (phone B):** Sign in as Sumangala Pillai — she's on the assembled team.
**Say:** "Confirmation is when she finds out, not before — no team member sees an invitation
until the customer's actually confirmed it." Accept the invitation. Open **Communities**, open
the team chat, send a message.

**Nidhi (laptop), cut in:** Reply from the customer side. Point out the sender's name on each
bubble. Type an English message while the UI's in Malayalam — the **Translate** control
appears on it automatically. Tap it, then tap **Listen** — read aloud in Malayalam.

## 3:00–3:40 — Voice and privacy (Anjana)

**Anjana (phone A):** Profile → Add skills → tap the mic, speak a skill in Malayalam.
**Say:** "It never applies what it heard directly — it goes to a review line first, because a
misheard phoneme can flip the meaning entirely." Show the review line, confirm it.

Tap **Listen** on a card with a price on it.
**Say:** "Numbers are spoken as real Malayalam words now — not read out in English digits,
which every voice used to do regardless of language."

**One line to camera (Nidhi or Anjana):** "Phone numbers are hashed, never stored raw.
Location snaps to a named area or rounds to a rough grid cell — never exact coordinates."

## 3:40–4:30 — Telegram (Niveditha, same phone)

**Niveditha:** Switch to Telegram, open **@LoomMarketPlace_bot**.
**Say:** "WhatsApp is the real target — Meta's review queue is slow and costs money to test
against, so Telegram is our demo stand-in. Same engine underneath, not a separate build."
`/start`, send phone number to link. Type "work" — ranked jobs come back, individual and group
both, group ones tagged.
Apply to one by number.

**Nidhi (laptop), cut in fast:** Refresh the applicants screen — the Telegram application is
already there, same `interests` row the app itself would show.

## 4:30–5:00 — Close (Nidhi, laptop)

**Say:** "Everything you just saw ran against our real production deployment — over 200
automated checks, zero mocks, re-verified after every change. This isn't a demo build. It's
the app." Cut to landing page or team card.

---

## Editing checklist

- [ ] Trim dead air at the start/end of each device's clip before cutting them together.
- [ ] Keep device transitions on a clean beat (end of a tap, not mid-scroll) — smoother cuts.
- [ ] Captions/subtitles for Malayalam UI text if the audience skews English-only.
- [ ] One title card at 0:00 (team names, "Loom", one-line tagline) and one at the very end
      (repo link / contact) — keep both under 3 seconds, this is a feature demo, not a title
      sequence.
- [ ] Target final runtime 4–6 minutes — cut section 5 (privacy) first if you're over, it's the
      only section that's narration-only with no new screen action.
