# Loom — Full Feature Demo Script

Click-by-click walkthrough covering every feature, including the Telegram bot. Written for
one laptop (customer, projected) + one phone (a provider, in your hand) + Telegram open on the
same or a second phone. Run `node scripts/demo-preflight.mjs` right before you go on — it
confirms these exact accounts are signed-in-able and the headline order is still `open`.

**Do not tap "Assemble" more than once during rehearsal** — it moves the order from `open` to
`assembling` and nothing puts it back. If you burn it, reseed (`npm run seed`) before the real
run.

## Accounts

| Who | Phone | Device |
|---|---|---|
| Sr. Alphonsa (customer) | 9876540002 | laptop, projected |
| Sheeba Thomas (provider) | 9876530006 | phone A |
| Sumangala Pillai (provider) | 9876530038 | phone B |
| Fathima Beevi (provider) | 9876530005 | phone C |

All OTP codes print on-screen (`TWILIO_DISABLED` demo mode) — no real SMS needed.

---

## 1. Sign-in and language (30s)

1. Open the site on the laptop. Point out: Malayalam by default (`lang="ml"`), one tap to
   English, dark mode toggle.
2. Sign in as Sr. Alphonsa (9876540002) → code appears on-screen, no waiting on SMS.
3. **If you have a fresh, never-used phone number handy**, sign up with it instead of an
   existing account here — this is the one place to show the **new signup flow**: consent
   screen (unticked by default) → name + role → **location, asked right here as the last step
   of signup**, before the app ever appears. (Skip this sub-step with existing demo accounts,
   which already have consent/location set.)

## 2. Individual job — post, feed, apply, decide two ways (3 min)

**Laptop (Sr. Alphonsa) → Request tab:**
4. Post an individual job: title "Stitch 2 blouses", pick the `stitching` skill from the
   pills, mode = Individual, price ₹400.
5. Point out the **"Skill not in the list? Type it"** field — type something like "zari
   embroidery" and add it. It's canonicalized live (alias match, typo tier, or a real
   Malayalam translation for something genuinely new — no more "chedi nadal" echoed back
   untranslated).
6. Set an **"Apply by"** deadline a few minutes out — new: individual jobs get this now, not
   just group orders.

**Phone A (Sheeba) → Browse:**
7. Sign in, find "Stitch 2 blouses" in the feed. Point out the **filters** (skill, distance,
   experience, price) and that the ranking is a real formula — `0.5×skillFit + 0.3×proximity +
   0.2×normalizedPay` — not a black box.
8. Apply.

**Phone B (Sumangala):** apply to the same job too, so there are two applicants.

**Laptop → Accepted tab:**
9. The card now shows **"Choose provider (2)"**. Open it.
10. Point out **score, distance, rating** on each applicant card, and the **sort controls**
    (by score / distance / rating).
11. Tap **"Auto select"** — this is new and deliberately NOT instant: it *previews* who the
    algorithm would pick and her score, with **Finalize** / **Cancel**. Show that nothing is
    awarded until you tap Finalize.
12. Tap **Finalize**. Back on the main list, the card now says **"Assigned to: Sheeba
    Thomas"** — individual jobs used to just say "assigned" with no way to tell who.
13. Tap **Mark finished**. Rate her from the completed-work history.

## 3. Group order — auto-assembly (2 min)

**Laptop → this is the seeded "30 school uniform sets" order, already posted and `open`.**
14. Open it from Accepted, tap **Assemble**. The algorithm builds a team — capacity-aware,
    distance-aware set cover across SHGs — and states its own coverage honestly ("4 providers
    across 2 groups cover stitching — coverage complete"), not just a yes/no.
15. Tap **Confirm**. This creates the team AND a group chat thread for exactly the people on
    it, automatically.
16. Phone A/B/C: the assembled providers see the invitation *only after* confirmation, and can
    Accept/Decline. Show a decline → swap-in from candidates.

## 4. Group order — open call (2 min)

**Laptop → Request tab:**
17. Post a group order: "20 caps", mode = Group, headcount = 2, an interest deadline, an
    *expected* price (explicitly not locked — shown to applicants as what she expects, not a
    promise).

**Phones A/B/C:** all three apply through the same feed individual jobs use, tagged GROUP.

**Laptop → Accepted → View applicants:**
18. She picks 2 of the 3 by hand (score/distance/rating visible here too) — the one not picked
    is told, not left waiting.
19. This lands on **FinalizeGroup**: pick a coordinator — **only from the team, or by phone
    number** (not a browsable list of every provider — appointing a coordinator and appointing
    a stranger used to look identical), then set the real, finalized rate.

## 5. Coordinator lifecycle (2 min)

20. If you appointed a provider as coordinator: on her phone, she sees **Accept/Decline** —
    appointment isn't automatic acceptance.
21. Decline it once to show: a popup + banner tell the customer, and that same person can't be
    re-appointed by mistake (remembered declines). Re-appoint a different one; she accepts.
22. She uploads the **reference photo** (coordinator-only to add, visible to the whole team).
23. Try **Mark finished** as the customer before sign-off — refused, with a clear "waiting on
    coordinator" note. The coordinator signs off; now it completes.

## 6. Community chat — photos, sender names, translate (2 min)

24. **Laptop → Communities tab** — this is new: customers couldn't reach this screen at all
    before (the tab wasn't wired in, even though the backend always supported it).
25. Open the group's chat thread. Send a message.
26. On a phone, reply in Malayalam. Point out the **sender's name** above each message (not
    useful in a 2-person chat, essential in a group one).
27. Tap the **photo icon**, send a picture — shown inline in the thread.
28. Type a message in English on the laptop while the UI is set to Malayalam — a
    **"Translate"** control appears on it automatically (script-detected, not UI-language
    dependent), showing the Malayalam translation and letting you hear it read aloud in
    Malayalam via the same Listen button.

## 7. Voice and accessibility (1.5 min)

29. **Profile → Add skills**: tap the mic, speak a skill in Malayalam. It lands in a **review
    line** first — never applied straight into her skill list, since a misheard phoneme
    (`പാചകം`/cooking vs `പഞ്ചകം`/a five-day span) needs a chance to be caught.
30. Tap **×** on an existing skill pill — providers can now remove a skill, not just add one.
31. Tap **Listen** on any narration/message with a number in it (a rate, a distance) — numbers
    are spoken as real Malayalam words ("ഇരുനൂറ്റിഎഴുപത്തിഅഞ്ച്"), not read out in English
    digits, which every voice used to do regardless of language.

## 8. Privacy (1 min, narrate over the screen — no clicks needed)

32. Point at the consent screen from step 3: unticked by default, server-enforced.
33. Mention: phone numbers are HMAC-hashed with a secret salt, never stored raw. Location
    snaps to a named area within 3km or rounds to a ~1km grid cell — never raw coordinates, and
    a "Near X" label is only used if X is actually within 50km (a mislabeled reading that was
    175km off used to still say "Near Ernakulam").
34. **Profile → Delete account** on a throwaway test number: retype the number to confirm,
    account is gone — both roles if she holds both, not soft-deleted.

## 9. Telegram — the demo channel (2 min)

**Why**: WhatsApp is the real deployment target, but Meta's Business API review queue is slow
and sending through it costs money to test with — Telegram needs neither, and it's the *same
engine* underneath (`_lib/messagingEngine.ts`), not a separate implementation.

35. Open Telegram, find **`@LoomMarketPlace_bot`**.
36. `/start` → send your phone number to link the chat to an account (Telegram doesn't verify
    numbers the way WhatsApp/Twilio do, so this proves it once and remembers it).
37. Type **"work"** (or the Malayalam word) → the bot replies with ranked jobs, **individual
    and group both**, group ones tagged so you can tell them apart.
38. Apply to one by number — this writes the exact same `interests` row the app itself would
    show the customer; switch back to the laptop and show it appearing live in her applicants
    list.
39. Send **"TEAM"** to check invitations, or send a voice note — it's transcribed
    (Sarvam/Bhashini) and read back so a mistranscription can be caught before it's acted on.
40. Point out what's deliberately **not** on the bot: posting a job, staffing a team,
    coordinator actions. Those are customer-initiated or higher-stakes and stay app-only.

## 10. Close (30s)

41. One line: everything shown just ran against the real production deployment — 200+
    automated checks, zero mocks, re-verified after every change this session. This isn't a
    demo build, it's the actual app.

---

## If something breaks live

- **"Assemble" already used**: skip step 14, narrate over a screenshot instead, and mention
  reseeding is the fix for next time — don't tap it again on stage.
- **Telegram bot silent**: check `@LoomMarketPlace_bot` hasn't been rate-limited; fall back to
  narrating the WhatsApp webhook logic instead ("same engine, different front door").
- **A translation/voice call fails** (network flake to Sarvam/Bhashini/Google Translate): the
  UI falls back gracefully — Listen falls back to the device's own voice, Translate falls back
  to showing the original text. Say so out loud rather than looking stuck.
