# Loom — Viva Preparation

Everything you might get asked, with real answers grounded in the actual code — not the pitch
version. Organized so you can find a question fast under pressure.

Team: **Nidhi Rakesh · Niveditha G. S. · Anjana Nandakumar** — IIIT Kottayam.

---

## 1. The problem and why it's real

**Q: What problem does this actually solve?**
Kerala's Kudumbashree network has 4.5 million women in self-help groups (8.5M+ across India).
They have skills and, since microfinance, they have credit. What they don't have is a market —
and it splits into two genuinely different gaps:
1. Individual work travels by word of mouth only — no way to discover a nearby paying job.
2. Large orders (200 uniforms, a 300-person catering order) need more hands than one SHG has,
   so they go to a city factory instead — not because the skill is missing, but because
   nothing assembles it locally.

**Q: Why can't they just use a generic job board / WhatsApp group?**
A job board solves gap 1 only. Nothing generic solves gap 2, because staffing a large order
needs a real algorithm — deciding *who*, in what combination, covers the order, deterministically
and explainably — not just a listing.

**Q: Who's the actual user, and what's their device/literacy constraint?**
A woman with a basic Android phone, possibly not comfortable typing, possibly more fluent
speaking than reading English. That's why: Malayalam-first UI, voice input on skill entry,
voice narration of decisions, and a WhatsApp/Telegram front door (no app install required).

---

## 2. Architecture — the big picture

**Q: Walk me through the stack.**
- **Frontend**: React + Vite + TypeScript, Tailwind with CSS-variable design tokens (so dark
  mode needs zero `dark:` variant classes — tokens just re-point).
- **Backend**: Vercel serverless functions, but collapsed into **one function** (`api/[...path].ts`)
  that dispatches through a typed registry (`api/_routes/index.ts`) — not 40+ separate functions.
- **Database**: Supabase (managed Postgres), Row-Level Security on every table, 30 tables,
  14 migrations layered on the base schema.
- **Auth**: phone + OTP (Twilio Verify in production, demo on-screen fallback), bearer-token
  sessions — no passwords.
- **Speech**: Web Speech API client-side (free, on-device); Bhashini/Sarvam server-side for
  WhatsApp/Telegram voice notes and higher-quality narration.
- **Messaging**: one channel-agnostic engine (`_lib/messagingEngine.ts`) with two thin adapters
  — WhatsApp (real) and Telegram (demo, because Meta's review queue is slow/costly to test with).

**Q: Why one serverless function instead of one-per-route?**
Vercel's Hobby plan caps a deployment at 12 functions. With ~50 routes as separate files, the
*build* succeeds but the *deploy* fails silently past the cap. Routes live under `api/_routes/`
(underscore-prefixed directories are excluded from Vercel's function detection), and
`api/[...path].ts` is the one real function, with `vercel.json` rewriting `/api/*` to it. This
was found the hard way — a naive catch-all filename (`api/[...path].ts` alone, without the
`_routes` split) built fine but Vercel returned its own 404 for every request with zero
invocation logs, which is what actually pointed at the function-count ceiling.

**Q: Why Supabase over raw Postgres, or over Convex (which the ported code clearly used to run
on)?**
The codebase has comments like "ported from convex/teamAssembly.ts" throughout — this *was*
built on Convex first, then migrated to Supabase/Vercel. Convex doesn't give you SQL and its
free-tier function model didn't fit the deployment constraints as cleanly; Supabase gives real
Postgres (so the deterministic scoring/matching logic, which is inherently relational — skills,
distances, coverage — maps naturally to SQL joins) plus RLS, storage buckets, and a generous
free tier in one package.

**Q: Why RLS on every table if the browser never talks to Supabase directly?**
Defense in depth, and it was a **real vulnerability found and fixed**, not theoretical: the
browser ships the Supabase anon key in its JS bundle. Without RLS, anyone who opened dev tools
could read the anon key and query every table directly, bypassing all the authorization logic
in the API routes entirely. RLS means even a leaked anon key gets nothing.

---

## 3. The matching engine — the technical core

**Q: Why "no LLM"? Isn't that leaving something on the table?**
Because every match has to be *auditable and reproducible*. If a customer asks "why was I
matched with her and not someone closer," the answer has to be a real, inspectable computation
— not "the model decided." An LLM would also add latency, per-call cost, and non-determinism to
something that's supposed to be a trustworthy allocation of paid work, not a chat response.

**Q: How does individual-job ranking actually work? Give me the formula.**
`_lib/scoring.ts`, weighted linear combination:
```
total = 0.5 × skillFit + 0.3 × proximity + 0.2 × normalizedPay
```
- `skillFit = clamp(proficiency / 5, 0, 1)` — proficiency is a provider's self-rated 0–5 skill level.
- `proximity = 1 / (1 + distanceKm)` — smooth decay, not banded tiers, so a provider isn't cliff-edged
  out at some arbitrary radius.
- `normalizedPay = min(1, pay / 2000)` — caps at ₹2000 so one huge outlier order doesn't dominate
  ranking; pay above that all scores 1.0 for this component.
Weights are fixed constants (not learned, not configurable per-request) — deliberately, so the
same inputs always produce the same ranking. That's the whole "deterministic" claim in one file.

**Q: How does group-order staffing (auto-assembly) work? Is it actually solving set cover?**
`team-assembly/assemble.ts` — yes, a **greedy, capacity-aware set-cover** over the pool of
providers with the needed skills, restricted to the same location cluster. Concretely:
1. Pull every provider with any of the required skills, their proficiency per skill, capacity,
   and distance from the job.
2. Sort candidates deterministically: **proficiency descending, then distance ascending, then a
   creation-ordered tiebreak (`seq`)** — never randomness.
3. Greedily assign the top-ranked candidate to a skill's remaining need, consuming their
   capacity, until either the skill's quantity is covered or candidates run out.
4. Repeat per skill. The result states its own coverage honestly — "4 providers across 2 groups
   cover stitching" or, if it couldn't fully cover, exactly what's short — rather than silently
   returning a partial team as if it succeeded.

**Q: Why "greedy" and not an optimal set-cover solver?** Optimal set cover is NP-hard in
general. Greedy is the standard practical approximation (and provably within a `ln(n)` factor
of optimal for the classic formulation) — and more importantly here, "explainable and
deterministic" matters more than "globally optimal," since a customer needs to be able to
understand *why* a specific team was chosen.

**Q: What's `seq` and why does it exist?** The original Convex backend sorted ties by
`_id`, which was creation-ordered. Postgres `uuid`s are random (v4), so they can't stand in for
"who was here first" — `seq` is a `bigserial` added specifically to preserve that tiebreak
semantic across the migration, on both `providers` and `team_members`.

**Q: What's the difference between auto-assembly and "open call"? Why build both?**
Two different trust models for the same problem (staffing a group order):
- **Auto-assembly**: the algorithm picks the team. Fast, no waiting, but the customer is
  trusting the algorithm's judgment.
- **Open call**: the customer states a headcount and deadline, anyone qualified applies through
  the same feed individual jobs use, and she picks from actual applicants. Slower, but she's
  choosing people, not delegating the choice.
Built both because real customers vary in how much control they want, and neither approach is
strictly better — a set-cover algorithm can't know she specifically trusts one SHG's usual
group over a stranger with a marginally better score.

**Q: Skill canonicalization — how does "sewing", "thayyal", "തയ്യൽ", and a typo like "stiching"
all become one skill?**
`_lib/text.ts`, a **two-tier match**:
1. **Exact/alias tier**: normalized text (`trim().toLowerCase()`, whitespace collapsed) checked
   against a curated `skill_aliases` table — this is how `thayyal` and `തയ്യൽ` (different
   scripts/languages) map to the same canonical skill.
2. **Fuzzy tier, for typos only**: **Sørensen–Dice coefficient over character trigrams**
   (not Levenshtein) — deliberately narrow, tuned so real typos match but semantically different
   words with superficially similar spelling don't. The code has a documented regression case:
   "covering" scored 0.56 against the alias "catering" on trigrams alone, which is wrong — so the
   fuzzy tier requires **two independent thresholds to both pass**, not just one similarity score,
   specifically to stop that kind of false positive.
Any phrase that matches neither tier becomes a **new** canonical skill (via a
`skill_candidates` moderation queue), reused — not re-created — the next time someone says it.

**Q: How is distance actually computed? Not GPS-exact, right?**
`_lib/geo.ts`. Haversine great-circle distance between two location rows' lat/lng, with a
**precomputed `near_distances` table** as a fast-path cache (avoids recomputing haversine for
every pair on every request) and haversine as the fallback for any pair not yet cached. Distance
is never between two *people's* raw coordinates directly — it's between two *location rows*,
which are themselves privacy-transformed (see §5).

---

## 4. Coordinator, group orders, and the decisions behind the UX

**Q: Why does a group order need a "coordinator" concept at all?**
Because a group of independent providers has no single point of accountability by default — if
5 women are jointly doing a 200-uniform order, who's the one person who can say "we agreed to
₹350/piece," upload the one reference photo everyone works from, and sign off that the whole
job is actually done? Without a coordinator, either the customer has to individually manage 5
separate relationships, or nobody's accountable and disputes have no resolution path.

**Q: Walk me through the full coordinator lifecycle.**
1. **Default**: the customer herself coordinates — no extra step, no separate accept.
2. **Appointment**: she can name a provider instead — restricted to someone already on the
   confirmed team, or someone she explicitly looks up by phone number (deliberately *not* a
   browsable list of every provider in the app — appointing a coordinator and appointing a
   random stranger used to look identical, which was a real bug fixed this session).
3. **Response required**: appointment is unilateral, coordinating is not. The appointed provider
   must **Accept or Decline** — nothing that commits her (sign-off, pattern uploads) is reachable
   until she accepts.
4. **Decline handling**: reverts the role to customer, but *remembers* who declined
   (`coordinator_declined_ids`) so the same person can't be re-appointed by mistake, and clears
   `coordinator_decided_at` so the UI shows "waiting for coordinator selection" rather than
   silently falling back to a decision nobody actually made.
5. **Sign-off gate**: if the coordinator is an appointed provider, `requests/complete.ts`
   refuses to mark the job finished until she signs off (409 `awaiting-coordinator-signoff`). If
   the coordinator is the customer herself, completing the job **is** the sign-off — no redundant
   extra step for someone who's already both sides of that decision.

**Q: What does a coordinator actually control that a regular team member doesn't?**
One agreed rate for the whole team (instead of every member's own independent rate, which would
let the same job get quoted differently to different applicants), the shared reference photo
(what the finished work should look like), and the completion sign-off.

**Q: Why is the price ("agreed rate") settled *after* staffing, not at posting?**
Because at posting time nobody's actually talked yet — `requests/create.ts` still accepts an
optional starting figure, shown to applicants as what she *expects* to pay, explicitly not a
locked number. The real, binding price is set once the team exists and has actually discussed
it — via `requests/set-coordinator.ts`, reachable any time before the job is marked complete
(not gated to `status === 'open'`, since settling the coordinator/price is exactly the step that
happens *after* the job leaves 'open').

**Q: How does the "community chat" work — when does a group order get a conversation?**
Team confirmation (`team-assembly/confirm.ts` for auto-assembly, `requests/select-team.ts` for
open call) idempotently creates a `chat_threads` row keyed `(context_type: 'team', context_id:
<team id>)`. Membership isn't a separate table — it's derived live from `team_members` (excluding
anyone who declined) plus the request's customer, every time the thread is read. That means
accepts, declines, and replacements on the team automatically follow through to who can read the
chat, with zero bookkeeping.

**Q: Any real bugs you found and fixed in this area, worth mentioning?**
Two, both from this session, both instructive:
1. `chatAccess.ts`'s thread-*list* query (`visibleThreads`) built its candidate request-id set
   only from `context_type: 'request'` threads — but a team thread's `context_id` is the
   **team's** id, never the request's, so that set was silently empty for every team chat there
   is. The customer-lookup map derived from it stayed empty too, meaning **no customer could
   ever see her own team's chat**, regardless of who coordinated it. Fixed by resolving the
   team's request id first, then including it in the request lookup. (Single-thread access
   checks, used by send/read, were never affected — only the list view.)
2. Separately, `CustomerApp.tsx` never rendered the `Communities` tab at all — so even after
   fixing the query above, a customer had no navigation path to reach it. Two independent bugs
   that looked like one symptom.

---

## 5. Privacy and security — the questions that will actually get asked

**Q: How are phone numbers protected?**
Never stored as given. `HMAC-SHA256` with a **secret salt** (`_lib/text.ts`'s `hashPhone`).
Earlier the codebase used `fnv1a`, a 32-bit non-cryptographic hash — with ~10⁹ possible Indian
mobile numbers, every stored digest was brute-forceable in seconds. HMAC with a real secret
makes that infeasible. The consent screen is honest that the number "isn't shown to anyone" but
does **not** claim the hash is untraceable — an accurate claim, not an inflated one.

**Q: How is location kept private if distance-based matching needs it?**
`resolveLocationId` in `_lib/geo.ts` — a captured GPS reading is never stored exactly:
1. If it's within 3km of a **named** area already known, she's assigned to that row — nothing
   new is written, she shares it with neighbours, and her exact position within the area was
   never recorded in the first place.
2. Otherwise it's rounded to a ~1km grid cell and given a name relative to the nearest known
   place ("Near Aluva") — never shown as raw coordinates.
3. **A distance cap on that label** (fixed this session): the nearest known place has to
   actually be within 50km to be named in the label — otherwise it's "New area," not a
   misleadingly specific "Near X" attached to somewhere hundreds of km off (which happened with
   a real account's inaccurate device geolocation reading).

**Q: Consent — is it a real gate or just a UI courtesy?**
Server-enforced, not just hidden by the UI: `auth/complete-login.ts` 400s outright if
`consent: true` isn't sent, regardless of what the client did or didn't show. The screen itself
defaults the checkbox **unticked**.

**Q: Does account deletion actually delete, or soft-delete?**
Actually deletes, in FK-safe order: storage objects (photos) before their DB rows, the audit
trail (`matches`) before anything referencing it, every message she authored (scrubbed even from
threads that survive her), then the account row itself. If she holds both roles (provider and
customer), both get erased — not half-erased. Requires **retyping her own phone number** to
confirm — a live session token alone isn't accepted, because the number is never shown back to
her anywhere in the app, so someone holding just a stolen token wouldn't have it memorized either.

**Q: Chat privacy — how is a thread actually private?**
A non-participant probing a thread id gets **404, not 403** — the existence of a thread you're
not in can't even be confirmed by trying. Enforced through `requireThreadAccess`/`canAccessThread`
in `_lib/chatAccess.ts`, checked server-side on every read and write (the browser never talks to
Supabase directly, so RLS alone can't do this check — it has no idea who's asking).

---

## 6. Voice and accessibility

**Q: Why voice input, and why review it instead of applying it directly?**
The target user may not be comfortable typing. But a misheard Malayalam phoneme is a real risk
— the docs give the concrete example of `പാചകം` (cooking) vs. `പഞ്ചകം` (a five-day period),
one phoneme apart. So a spoken skill never writes directly into her skill list — it lands in a
review line first, exactly the same courtesy a typo would get.

**Q: How does text-to-speech work, and what was broken about it?**
Two paths: the server (Bhashini/Sarvam, works regardless of what's installed on her device) tried
first, falling back to the browser's own `SpeechSynthesis` API if no server key is configured or
the call fails. Bug found and fixed this session: **both** paths read bare digit characters in
English regardless of the utterance's declared language — a voice speaks the *script* it's
given, and digits aren't Malayalam script. `_lib/malayalamNumbers.ts` now converts numbers to
actual Malayalam words (Indian lakh/crore grouping, with correct sandhi — e.g. "ഇരുപത്തിരണ്ട്"
for 22, not a mechanically-glued "ഇരുപത്ത്തിരണ്ട്") before either voice ever sees the text.

**Q: What's `canSpeak` / why does the Listen button sometimes not appear?**
It deliberately refuses rather than degrading — a Malayalam sentence read by an English voice
isn't degraded output, it's actively worse (sounds like the app is broken). `canSpeak(lang)`
checks whether the device actually has a voice for that language installed before offering the
control at all; if not, the text is still shown, just not spoken.

---

## 7. Two messaging channels, one engine

**Q: How is WhatsApp/Telegram logic shared, not duplicated?**
`_lib/messagingEngine.ts` is entirely channel-agnostic — takes a phone number and whatever text
or transcribed voice a person sent, returns what to say back. Two thin adapters
(`whatsapp/webhook.ts`, `telegram/webhook.ts`) translate their platform's request/response shape
to and from that one engine.

**Q: Why Telegram at all if WhatsApp is "the real thing"?**
Purely practical: Meta's WhatsApp Business API review queue is slow, and sending real messages
through it can cost money during development/demo. Telegram needs neither. It's explicitly a
demo-only channel — the real deployment target is WhatsApp.

**Q: Telegram doesn't verify phone numbers the way Twilio/WhatsApp does — how is identity
handled there?**
A `telegram_links` table (migration 010) maps a Telegram chat id to a phone number, resolved
once via the same matching logic sign-in uses, then remembered for that chat's future messages —
so a conversation proves its number once rather than re-verifying every message.

**Q: What's actually reachable over chat vs. app-only?**
Individual jobs, group open-call jobs (explicitly tagged so a provider can tell them apart in
the same feed), applying, team invitations, accept/decline, "my work" status, and voice notes —
all provider-side. Posting a job, staffing a team, and coordinator actions (pattern photo,
sign-off) are deliberately app-only — those are customer-initiated or higher-stakes actions that
don't map cleanly onto a bot conversation.

---

## 8. Verification discipline

**Q: How do you know this actually works, not just "looks right in the editor"?**
Everything is verified against the **live production deployment**, not a local mock:
- **`scripts/e2e.mjs`**, 183 checks (and growing) — signs real accounts in through the actual
  phone+OTP flow against production, no fixtures, no direct DB access. Covers both matching
  modes, open call, the coordinator lifecycle end-to-end (appoint → accept/decline → re-appoint
  → sign-off → complete), consent, account deletion, location privacy, chat privacy and
  isolation, WhatsApp *and* Telegram, and authorization boundaries (a non-owner can't edit
  someone else's request, a non-participant gets 404 on a thread, etc.).
- **`scripts/demo-preflight.mjs`** — a separate, narrower check that the exact accounts and
  order state the live demo depends on are actually in a presentable state before going on stage.
- Every change is built (`tsc -b && vite build`), linted, migrated (if schema changed, with the
  SQL run and verified via a direct query before dependent code ships), pushed, and
  re-verified against the live deploy — nothing ships on "should work."

**Q: Give me an example of the verification process catching something real.**
After registering two new routes' files, the very first e2e run against production 404'd on
both — because the router (`api/_routes/index.ts`) is an **explicit** map, and the files existed
but were never added to it. The build and lint both passed (TypeScript has no way to know a
route "should" be registered) — only hitting the live deploy caught it. Fixed and re-verified in
the same session before moving on.

---

## 9. Data model — the tables that matter

**Q: Sketch the core schema for me.**
- `providers` / `customers` — role-specific profile tables, both reference `locations`.
- `provider_skills` — proficiency (0–5) per (provider, skill) pair.
- `skills` / `skill_aliases` / `skill_candidates` — canonical skill, its known synonyms, and
  new unapproved phrases awaiting moderation.
- `requests` — the job itself: mode (individual/group), units, pay, status, and (migrations
  009/012/014) all the coordinator fields: role, appointed provider, agreed rate, response
  state, declined-ids, decided-at.
- `request_skills` — per-skill quantity needed on a request.
- `interests` — a provider's response to a request (`interested` / `accepted` / `declined`) —
  this is what "applying" writes to, for both individual jobs and open-call group jobs.
- `teams` / `team_members` — the auto-assembly (and, since this session, open-call) staffing
  result: which providers, on which skill, covering how many units, in what state.
- `matches` — an **audit trail**, not a live-state table: one row per award decision (individual
  or team), with the scoring/path data that justifies it. Never cascade-deleted from a request —
  deliberately, since it's the historical record.
- `chat_threads` / `messages` — polymorphic threads (`context_type`: provider / request / team /
  direct), membership derived rather than stored.
- `locations` / `near_distances` — the privacy-preserving location model and its distance cache.
- `consents`, `telegram_links`, `request_patterns`, `narrations`, `ratings`, `grievances` —
  supporting tables for consent audit, chat identity linking, reference photos, narration text,
  post-completion ratings, and disputes.

**Q: Why 14 migrations instead of one clean schema?** Because the schema evolved with real
feature work, tracked incrementally rather than rewritten — phone rehashing (006), RLS lockdown
(005), the open-call model (007), consent (008), the coordinator feature (009/012/014), Telegram
linking (010), customer location confirmation (011), chat attachments (013). Each migration is a
real, reviewable, individually-runnable change, which matters because these ran against a live
database with real data, not a fresh test instance every time.

---

## 10. Known limitations / what's ahead

Be upfront about these — a viva panel respects "here's what's not done and why" far more than a
claim of completeness that falls apart under one follow-up question.

- **No real pilot yet.** Seed/demo data is fictional (~40 providers/customers, one 30-uniform
  order); the actual milestone ahead is one real order with one real SHG, not another feature.
- **No fair-rotation mechanism.** The scoring formula is a straight ranking — nothing currently
  prevents the same top-ranked provider(s) from being matched repeatedly while others never
  surface. Explicitly called out as future work, not an oversight.
- **Voice input is skill-entry only**, not the whole app yet.
- **Coordinator appointment still requires an existing account** — there's no invite-and-claim
  flow for someone outside the platform entirely (e.g., via a QR code). Explored and deliberately
  deferred: it needs a new accountless auth pathway (invite tokens, phone-verified claim), which
  is a meaningfully bigger scope than the rest of the coordinator feature.
- **`visibleThreads`'s candidate fetch is a flat recency window** (most recent N threads
  site-wide, then filtered per-user) rather than a per-user-scoped query. Works fine at current
  scale (single digits of threads in production right now) but doesn't scale cleanly — a design
  debt worth naming if asked about scale, not yet a live bug.
- **Going live for real** still needs: WhatsApp's own Meta Business approval (the review queue
  this project's Telegram fallback exists specifically to route around), rotating any keys
  currently in dev use, and real area names for the pilot's actual geography (currently seeded
  around fictional/approximate Kerala localities).
- **Making the repository public** — currently private during active development.

---

## 11. Rapid-fire — likely one-liners

- **"Is this using a real database or mocked?"** Real Supabase Postgres, RLS on every table,
  live in production at `loom-lovat-phi.vercel.app`.
- **"Multi-tenant? Can two customers' data leak into each other?"** No — every route checks
  ownership server-side (e.g. `select-team.ts` verifies `request.customer_id === session.userId`
  before touching anything), and RLS is the backstop if the API layer were ever bypassed.
- **"What happens if two providers apply to the last slot at the same time?"** `select-team.ts`
  re-checks each provider's `interests` row state at selection time and requires it still be
  `interested`; a stale/already-resolved id is rejected with a 400, not silently accepted.
- **"Is the scoring weighting configurable?"** No — fixed constants (`WEIGHTS` in
  `scoring.ts`), by design, so "same input → same output" isn't dependent on hidden runtime
  config drifting.
- **"What's the actual demo-vs-real difference?"** Only the messaging channel (Telegram vs.
  WhatsApp) and OTP delivery (on-screen fallback vs. real SMS) — same database, same matching
  engine, same API, same UI, same code path either way.
