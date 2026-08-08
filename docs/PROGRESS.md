# Loom — Progress Check Report

**Team project:** Loom — a two-sided skills marketplace for women's Self-Help Group (SHG)
networks in Kerala.
**Period covered:** 13 July 2026 – 7 August 2026
**Live deployment:** https://loom-lovat-phi.vercel.app
**Repository:** https://github.com/nidheerakesh/loom

> Maintained doc — update as work lands. Last updated 8 Aug 2026 (auth fix, skill matching, doc accuracy).

---

## 1. What the project is

Providers — an individual woman or a small SHG-run shop — list the skills they offer.
Customers browse, filter and request work. Small jobs go to one person; large or multi-skill
orders assemble a **team across different SHGs**, capacity-aware and distance-aware.

Two decisions shape the whole build:

- **Malayalam-first.** Skills, matches and narration render in Malayalam. A user typing
  "sewing", "tailoring" or "തയ്യൽ" must land on the *same* canonical skill, or the
  marketplace fragments into unsearchable synonyms.
- **Deterministic matching.** Ranking and team assembly are explainable, reproducible
  functions — not a black box. Every match can be narrated back to the user.

---

## 2. Progress summary

| Milestone | Status |
|---|---|
| Planning docs (PRD, TDD, user flows, UI/UX) | Complete |
| Data model — 24 tables, RLS, deterministic tiebreak columns | Complete |
| Backend — 33 API routes across 11 feature areas | Complete |
| Frontend — 13 screens, provider + customer apps | Complete |
| Skill canonicalisation with synonym merging | Complete |
| Deterministic matching + team assembly | Complete |
| Phone + OTP authentication | Complete |
| Deployed and publicly reachable | Complete |
| Realistic demo data | Complete |
| Chat privacy | Fixed; one migration pending |
| Text-to-speech (Malayalam + English) | Complete |
| Provider "My work" view | Complete |
| Performance — N+1 elimination | Complete; index migration pending |
| Malayalam-first defaults + font | Complete |

**Scale:** ~5,850 lines of TypeScript/TSX — 35 API handlers, 13 shared server modules,
13 React screens, 24 Postgres tables.

---

## 3. Tools, technologies and components

| Layer | Choice | Version | Why |
|---|---|---|---|
| Frontend | React + Vite | 18.3 / 5.3 | Fast builds, simple SPA |
| Language | TypeScript | 5.2 | Strict mode across app and API |
| Styling | Tailwind CSS | 3.4 | Custom Kerala-handloom palette |
| Server state | TanStack Query | 5.59 | Caching + polling |
| Database | Supabase (Postgres) | — | Managed Postgres, RLS |
| Backend | Vercel Serverless Functions | @vercel/node 3.2 | Same-origin `/api/*`, no separate server |
| Validation | Zod | 3.23 | Request schemas at every route boundary |
| SMS | Twilio Verify | optional | Falls back to on-screen code in demo |

**Custom palette**, defined in `tailwind.config.js` and drawn from Kerala handloom:
`cotton #F3EFE6`, `indigo #26364F`, `kasavu #C9A227`, `madder #9C3B36`, `leaf #5B7A5B`.

---

## 4. Architecture

```
Browser (React + Vite, Malayalam/English)
        │  same-origin /api/*
        ▼
api/router.ts          ← the ONE serverless function
        │  path → handler map
        ▼
api/_routes/**         ← 33 handlers: auth, providers, customers, skills,
        │                requests, matching, team-assembly, narration,
        │                ratings, grievances, chat
        ▼
api/_lib/**            ← supabaseAdmin, auth, scoring, geo, skill matching,
        │                chat access control, LLM translation chain
        ▼
Supabase Postgres      ← 24 tables
```

The browser talks only to `/api/*`. No Supabase client ships to the browser, so the database
is never addressed directly by an untrusted caller.

---

## 5. Key components built

**Skill canonicalisation** (`api/_routes/skills/resolve.ts`) — free text becomes one canonical
skill. A curated alias table resolves known synonyms; anything unrecognised goes through a
translation fallback chain (Bhashini NMT → NVIDIA → Anthropic → Gemini → offline echo) so
the feature degrades instead of failing when no API key is set.

```
"sewing"            → തയ്യൽ  (stitching)   matched via alias
"garment finishing" → തയ്യൽ  (stitching)   matched via alias
"thayyal"           → തയ്യൽ  (stitching)   matched via alias  (Manglish)
"stiching"          → തയ്യൽ  (stitching)   matched via typo
```

Meaning lives in the curated alias table (~110 phrases over six skills, in English, Malayalam
and Manglish); fuzzy matching is restricted to typos. That split matters: character similarity
once resolved "covering" to *cooking*, having scored 0.56 against the alias "catering" — two
words differing by two letters. Lookalikes are not synonyms.

**Deterministic matching** (`api/_lib/scoring.ts`, `geo.ts`) — ranked on skill proficiency,
haversine distance, rate and rating, with explicit tiebreak columns (`providers.seq`,
`team_members.seq`) because Postgres UUIDs are random and ties must not reorder between runs.

**Team assembly** (`api/_routes/team-assembly/`) — splits a multi-skill order across providers
from different SHGs, respecting per-provider capacity, and reports whether skill coverage is
complete.

**Authentication** — phone + OTP only. The server resolves the account from the verified
number and returns one of three outcomes:

| Outcome | Meaning |
|---|---|
| `session` | Exactly one account → straight to dashboard |
| `choose` | Number holds both provider and customer accounts → pick one |
| `signup` | New number → collect name and role |

For the latter two the server issues a short-lived HMAC-signed ticket proving the number
passed OTP, redeemed once by `complete-login`.

**Chat** — private to participants, derived from thread context (see §7).

---

## 6. Challenges faced and how they were solved

### 6.1 Migrating off Convex mid-project

The original build used Convex. Moving to Supabase + Vercel meant rewriting every backend
function and reproducing Convex's implicit guarantees — most subtly, Convex `_id`s are
creation-ordered while Postgres UUIDv4 is random. Deterministic ranking silently broke on
ties. Solved with explicit `seq bigserial` tiebreak columns.

### 6.2 Deployment: three faults that all reported success

The hardest debugging of the month. Each failure produced a **green build and a ● Ready
deployment** while being completely broken.

1. **A build that produced nothing.** Production served an empty page. The build log:
   ```
   Build Completed in /vercel/output [92ms]
   Skipping cache upload because no files were prepared
   ```
   92 ms, no `npm install`, no functions. The project had been building from the repository
   root, which has no `package.json`. Root Directory had since been corrected — but *settings
   do not retroactively rebuild*, so the empty deployment stayed live.

2. **The Hobby function cap.** Vercel creates one function per file under `api/`, capped at 12
   on the Hobby plan; the API had 32 routes. The build succeeds and the **deploy step** fails
   afterwards, which reads like a code fault. Fixed by moving handlers into `api/_routes/`
   (underscore directories are excluded from function detection) behind a single entry point.

3. **A catch-all that is built but never routed to.** The obvious fix — `api/[...path].ts` —
   appears in the build output as `λ api/[...path]` and then receives nothing: every request
   returns Vercel's own `NOT_FOUND`, with no invocation and no logs. Isolated by deploying a
   static `api/ping.ts` beside it, which answered 200 from the same deployment — proving
   `/api` routing worked and catch-all routing specifically did not. Fixed with a static
   `api/router.ts` plus an explicit rewrite, preserving every public URL.

4. **ESM imports resolving at compile time but not runtime.** `@vercel/node` does not bundle;
   it compiles and runs under Node's native ESM loader, which requires fully specified paths:
   ```
   ERR_UNSUPPORTED_DIR_IMPORT: Directory import '/var/task/app/api/_routes'
   is not supported resolving ES modules imported from .../api/router.js
   ```
   The `TS2835` build warnings had been flagging this the whole time and were dismissed as
   cosmetic, because the build still completed. Fixed across 145 imports in 37 files.

**Lesson carried forward:** a green deployment proves the build ran, not that the thing
works. One real request against the deployed URL is what closes the loop.

### 6.3 The SPA rewrite swallowing the API

`vercel.json` rewrote `/(.*)` → `/index.html`. Harmless while each route was its own file
(exact filesystem matches are checked before rewrites), but once the API became one dynamic
route the rewrite won, and every `/api/*` call returned the app shell instead of JSON —
producing an HTML-parse error in the client and a perfectly healthy-looking deployment.
Now written `/((?!api/).*)`.

### 6.4 Skills fragmenting across synonyms

Without canonicalisation, "sewing", "tailoring" and "തയ്യൽ" become three unrelated skills and
search silently misses providers. Solved with a curated alias table plus the LLM fallback
chain in §5.

---

## 6a. Performance

The app was slow enough to be unusable on its main screen. The cause was not the network: the
API resolved relations in JS `for` loops rather than SQL joins, so latency scaled with row
count — directory search issued roughly two queries per provider.

Measured against production, before and after:

| endpoint | before | after | change |
|---|---|---|---|
| `providers/search` (Browse) | 21,008 ms | 1,350 ms | **15.6× faster** |
| `chat/threads` | 2,315 ms | 952 ms | 2.4× faster |

Two things were done. First, the hot paths were batched to a fixed number of queries
regardless of result size — `hydrateCards` for provider cards, one query for every thread's
last message, `distanceMap` in place of a per-row distance lookup, and PostgREST embedded
joins for the team routes. Second, the function was moved from `iad1` to `bom1`: requests were
entering at the Mumbai edge and executing in Washington, adding a round trip on every leg.

Honest caveat on the numbers: they were taken from a high-latency client, where a single
query costs ~1 s. The *relative* improvement is the meaningful figure; a user on a normal
connection sees smaller absolute times throughout.

An index migration (`004_perf_indexes.sql`) is written but not applied — it needs Postgres
credentials. Notably `bigserial` creates no index, so the `seq` columns the deterministic
tiebreak sorts by were unindexed.

## 6b. Accessibility and language

Voice existed nowhere in the app: `ListenButton` popped a `window.alert` showing the text,
which is precisely the wrong affordance for a user who may not read fluently. It now speaks,
in whichever language the user is reading, via the browser speech engine behind the adapter
shape `docs/TDD.md §4` specifies, so Bhashini or Sarvam can replace it with a key.

It refuses rather than substitutes when a device has no voice for the language — Malayalam
read in an English voice is unintelligible, and would look like a broken app rather than an
unsupported one.

Two Malayalam-first commitments were also unmet: the app defaulted to English on every load
and never persisted the choice, and the Malayalam font was named in CSS but never actually
loaded, so text rendered in whatever face the device happened to carry. Both fixed; the font
is now self-hosted (Malayalam subset, ~89 KB) rather than CDN-linked, because the app targets
patchy connections.

---

## 7. Security work

A review of the chat feature found conversations were readable by anyone, in four independent
ways. All four are fixed in code; one migration is pending (§8).

| # | Issue | Fix |
|---|---|---|
| 1 | `chat_threads` and `messages` had `for select using (true)` RLS, so the anon key — which ships in the public JS bundle — could read **every message in the app** via PostgREST | Policies dropped; no Supabase client ships to the browser at all |
| 2 | `GET /api/chat/threads` returned the 50 most recent threads system-wide to any signed-in user, with each one's last message | Scoped to threads the caller participates in |
| 3 | `GET /api/chat/messages` served any thread to anyone holding its id | Participation checked; non-participants get 404, so a thread id cannot be confirmed by probing |
| 4 | Provider chats were keyed on the provider id alone, so every customer contacting the same provider shared one thread and read the others' messages | Keyed on both parties |

The root cause of #1 is worth recording: the permissive policy existed so a browser-side
Supabase client could receive Realtime updates. **RLS cannot express "only participants"
here** — the app does not use Supabase Auth, so to Postgres every browser caller is the same
anonymous role, with no identity to filter on. The fix was to stop the browser talking to the
database entirely and move the check into the API, which knows the user via the `sessions`
table. Chat now polls instead of subscribing. Removing `@supabase/supabase-js` from the
browser also **halved the bundle, 438 KB → 221 KB**.

---

## 8. Known gaps / next steps

- **Pending migration.** `supabase/migrations/003_private_chat_rls.sql` drops the permissive
  policies on the live database. It needs Postgres credentials, so it is not applied
  automatically. **Until it runs, existing messages remain publicly readable**, and the anon
  key should be rotated afterwards since it was public while the policies existed.
  Migrations `001` and `002` drop two now-vestigial columns (`otps.role`, `skills.icon_key`).
- **Auth is demo-grade.** Sessions are bearer tokens in `localStorage` against our own
  `sessions` table, not Supabase Auth. OTP delivery is real when Twilio is configured;
  without it the code is shown on screen.
- **Externals.** Text-to-speech is real (browser Web Speech, ml-IN/en-IN) but depends on the
  device having a Malayalam voice. Speech-to-text and embeddings are not implemented. Matching
  is fully deterministic by design and does not depend on them.
- **Admin surface** is not built.
- **Lint debt.** A number of `no-misused-promises` warnings in `src/`; not in the deploy path.

---

## 9. Evidence

- **Live app:** https://loom-lovat-phi.vercel.app — sign in with any phone number; the OTP is
  shown on screen in demo mode.
- **Repository:** https://github.com/nidheerakesh/loom
- **Design docs:** `docs/PRD.md`, `docs/TDD.md`, `docs/USER_FLOWS.md`, `docs/UI_UX_DESIGN.md`
- **Architecture notes:** `app/README.md` records the three deployment constraints above, each
  with the symptom it produces, since all of them fail while reporting success.

### Demo data seeded

40 providers (Ernakulam SHG members with real names, rates and Malayalam skills), 5 customers,
5 requests spanning open / assembling / assigned / completed, 8 portfolio items, 8 bilingual
ratings, and a seeded conversation.

### Screenshots

> **TODO:** capture and add before submission —
> sign-in (phone step), first-time onboarding, provider dashboard with ranked matches,
> customer Browse with skill/distance/price filters, team assembly result, Malayalam narration.
