# Loom — Demo Runbook

Walk this before presenting. Every step is **action → expect → why it matters**, with the
`docs/SUBMISSION.md` claim each one demonstrates, so a failure tells you which claim you can no
longer make.

Seeded names and numbers are given literally — follow it without improvising, or you will not
know whether an unexpected result is a bug or your own variation.

**App:** https://loom-lovat-phi.vercel.app · **Time:** ~15 minutes for a full pass.

---

## 0 · Preconditions

| Check | How | If wrong |
|---|---|---|
| Migrations applied | `curl "$SUPABASE_URL/rest/v1/sessions?select=*&limit=1" -H "apikey: $VITE_SUPABASE_ANON_KEY"` returns `[]` | Run `005` then `003` from `app/supabase/migrations/`. Until then chat is world-readable |
| Known data state | `cd app && npm run seed` | — |
| Signed out | Seeding clears `sessions`, so everyone is logged out | Expected; sign in again |

**The OTP prints on screen.** Twilio is unconfigured, so any phone number works and the code is
shown in the box above the input. That is the demo path, not a bug — say so before someone asks.

**Polling is 7 seconds.** When a step says "the other side sees it", allow up to 7s. Not a
hang.

---

## A · Provider journey

*Claims: Malayalam-first interface · canonical skill vocabulary · grounded explanations*

| # | Action | Expect |
|---|---|---|
| A1 | Open the app in a private window | Loads **in Malayalam** — `ലൂം`, `ഫോൺ നമ്പർ`. §7 Malayalam-first |
| A2 | Tap `English`, reload | Still English. The choice persists — it used to reset every load |
| A3 | Tap `മലയാളം` to go back | Malayalam again |
| A4 | Enter `9876511001`, Send code | A 6-digit code appears on screen |
| A5 | Enter it, Verify | **No name or role was asked before this point.** Sign-in is phone + OTP only |
| A6 | Name `Ammini Joseph`, pick Provider, Continue | New number → onboarding. A returning number would have gone straight to the dashboard |
| A7 | Type `sewing, catering`, Confirm skills | `sewing → തയ്യൽ`, `catering → പാചകം`. **The canonicalisation claim** — different words, same skill |
| A8 | Tap Listen | Spoken in Malayalam. If the device has no `ml-IN` voice it shows the text instead — deliberate, an English voice reading Malayalam is unintelligible |
| A9 | Rate `320`, Experience `6`, Finish | Lands on **Find work** with ranked matches |
| A10 | Open a match (▶) | Malayalam sentence naming the skill, distance and pay, built from the logged match record |
| A11 | Tap Listen in the sheet | Same narration spoken |
| A12 | Tap Accept | Sheet closes |
| A13 | Go to **My work** | The job is there, marked **waiting for the customer** — not won. Accepting registers interest; the customer decides |

**Do not skip A13.** Until recently an accepted job vanished from every provider screen.

---

## B · Customer journey

*Claims: browse and filter · customer chooses · deterministic ranking*

| # | Action | Expect |
|---|---|---|
| B1 | Private window, `9876522002`, sign in as **Customer** `Meera Nair` | Lands on Browse |
| B2 | Count the cards | **36**, not 40 — four providers are seeded unavailable, so the availability filter is doing something |
| B3 | Tap `🧵 തയ്യൽ` (stitching) | List narrows; every remaining card lists stitching |
| B4 | Apply Distance `5km`, then Price `≤₹400` | Narrows further; cards obey both |
| B5 | Clear filters, open a provider | Rate, delivery, capacity, rating, portfolio |
| B6 | **Request** tab → title `Blouse stitching test`, Individual, 1 unit, ₹400, skill stitching → Submit | Appears under Accepted |
| B7 | In the other window, as the provider, apply to it | — |
| B8 | Repeat with a second provider (`9876511003`) | Two applicants |
| B9 | Back as customer → **Choose who does it (2)** | Both listed with ratings |
| B10 | Choose one | Request → `assigned`. **The other is declined automatically** — nobody waits on work already given away |
| B11 | Try to choose the second | Rejected. One individual job, one winner |
| B12 | Tap **Mark finished** | Status → `completed` |
| B13 | Tap it again | Rejected — a double tap must not read as success twice |

---

## C · Collective journey — the headline claim

*Claims: collective matching · cross-SHG teams · customer control · nothing committed silently*

| # | Action | Expect |
|---|---|---|
| C1 | As customer, open the seeded **30 school uniform sets** (group, 30 units, cutting + stitching + packaging) | — |
| C2 | Tap **Assemble team** | A team appears with a coverage rationale naming how many providers across how many SHGs |
| C3 | Read the member list | Members drawn from **more than one SHG** — the thing a job board cannot do |
| C4 | As a provider on that team, open **My work** | **Nothing.** The team is still the customer's draft |
| C5 | Back as customer, tap **Replace** on a member | Alternatives ranked proficiency → distance, excluding people already on the team |
| C6 | Choose a replacement | Member swapped, skill and units preserved |
| C7 | Tap **Confirm team** | — |
| C8 | As that provider, **My work** again (allow 7s) | The invitation appears **only now**. Steps C4 and C8 together are the whole point: no provider is committed to work the customer had not confirmed |
| C9 | Accept | Moves from *Team invitations* to *Team work* |

If short of time, **C is the section to demo.** It is the claim nothing else on the market makes.

---

## D · Communities

*Claim: conversations private to their participants*

| # | Action | Expect |
|---|---|---|
| D1 | As customer → **Communities** → New conversation | Providers do not see this button |
| D2 | Name it `Onam bulk order`, tick two providers, Start | Thread opens |
| D3 | Send a message | Appears; composer sits **above** the tab bar and is reachable |
| D4 | As one of those providers, open Communities | Thread visible with the last message |
| D5 | As a **third** provider | Thread absent entirely |
| D6 | Start a one-to-one with a provider you already chatted to from their profile | Same thread, not a duplicate |

---

## E · Cross-cutting

| # | Check | Expect |
|---|---|---|
| E1 | Switch to English on any screen with skills | Skill names become `stitching`, `cutting` — **not** `തയ്യൽ`, `വെട്ട്` |
| E2 | DevTools → Network → Font | `noto-sans-malayalam.woff2` loads. Malayalam was previously named in CSS but never fetched |
| E3 | Buttons and inputs | ≥56px tall |
| E4 | Rating a provider (after a completed job) | Star picker **and** a comment box — not a single button |
| E5 | Rate the same provider twice | One rating, revised. Not two |

---

## F · Negative checks

Each of these fails **silently** if broken — the app looks fine and the data is wrong.

| # | Check | Expect |
|---|---|---|
| F1 | Anon key vs `sessions`, `providers`, `messages` | `[]` every time. Anything else means migration 005 has not run and the database is public |
| F2 | `GET /api/requests/get?requestId=<id>` with no token | `401`. This was fully open until today |
| F3 | Read another user's chat thread by id | `404`, not `403` — a thread id must not be confirmable by probing |
| F4 | Edit a request after it is assigned | Rejected |
| F5 | Provider accepts a team invite before the customer confirms | Rejected, even by replaying the request directly |
| F6 | Audit rows | After an individual award and a team confirm, `matches` has a row for each. Invisible in the UI, and the traceability claim depends on it |

```bash
cd app && set -a && . .env.local && set +a
for t in sessions providers messages; do
  printf "%-10s %s\n" "$t" "$(curl -s "$SUPABASE_URL/rest/v1/$t?select=*&limit=1" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY")"
done
```

---

## Known limitations — say these before you are asked

From `docs/SUBMISSION.md` §11, and all visible during a demo:

- **No speech input.** Skills are typed. Output is spoken; input is not.
- **Locations are assigned, not captured.** Distances compute correctly over placeholder
  coordinates, so "3.2 km" is arithmetic on data that means nothing yet.
- **New skills are not translated** unless a `BHASHINI_API_KEY` is set — they fall back to the
  English word in the Malayalam field.
- **No graph visualisation.** The match justification is text.
- **7-second polling,** not live push — the deliberate cost of closing the chat privacy hole.

---

## Result log

| Section | Pass | Notes |
|---|---|---|
| A Provider | | |
| B Customer | | |
| C Collective | | |
| D Communities | | |
| E Cross-cutting | | |
| F Negative | | |
