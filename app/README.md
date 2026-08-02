# Loom — runnable demo (Supabase + Vercel + React)

Two-sided marketplace for women's SHG skill networks: **Providers** (a woman or a shop)
offer skills; **Customers** browse, filter, and request work; large/group orders assemble a
cross-group **team**. Skill synonyms merge to one canonical skill; matches are narrated in
Malayalam. Externals (STT/TTS/LLM, embeddings) are **mocked**; all matching is deterministic.

> Stack note: this build uses Supabase (Postgres) + Vercel Serverless Functions + React/Vite
> (diverges from `docs/TDD.md`, which specs FastAPI/Neo4j). See `docs/TDD.md §3` implementation
> note.

## Run locally

```bash
cd app
npm install                 # first time only

# once, against a fresh Supabase project — run supabase/schema.sql (Supabase SQL Editor,
# or `psql "$SUPABASE_DB_URL" -f supabase/schema.sql`), then seed deterministic demo data:
npm run seed

# Terminal 1 — local API server (serves api/**/*.ts the same way Vercel does in production)
npm run dev:api

# Terminal 2 — frontend
npm run dev
```

Open http://localhost:5173.

## Try it

- **Provider**: pick 🧵 Provider, any phone + name → the OTP is shown on screen (mock) →
  verify. In **Profile**, type a synonym like `garment sewing, catering` → it resolves to the
  **canonical** skills (തയ്യൽ / പാചകം). **Current** shows ranked "find work" matches; tap ▶
  for the Malayalam narration + graph path.
- **Customer**: pick 🛍️ Customer → **Browse** and filter by distance / experience / price →
  open a provider → **Chat**. **Request** → choose **Group**, add skills + units → **Submit**
  → **Assemble team** → review the deterministic team (across SHGs, capacity-aware) → Confirm.

## Layout

- `supabase/schema.sql` — Postgres schema (24 tables, deterministic tiebreak columns like
  `providers.seq`/`team_members.seq`, RLS policies for the two chat tables).
- `api/` — Vercel Serverless Functions, **one file per route**: `_lib/` (shared
  `supabaseAdmin` client, auth, scoring, geo, skill-text matching, LLM translation fallback
  chain), then one route group per resource (`auth/`, `providers/`, `customers/`, `skills/`,
  `requests/`, `matching/`, `team-assembly/`, `narration/`, `ratings/`, `grievances/`,
  `chat/`). Each non-underscore `.ts` file becomes its own function, routed by its path —
  `api/auth/me.ts` serves `/api/auth/me`. Underscore-prefixed directories like `_lib/` are
  excluded from function detection. See "Keep one file per route" under Deploying before
  reorganising this.
- `scripts/` — `seed.ts` (full demo data), `reset-users.ts` (clear accounts, keep the skill/
  geography catalogue; `--reference` also rebuilds the catalogue), `dev-api-server.ts` (local
  stand-in for `vercel dev`).
- `src/features/` — `SignIn`, `provider/*`, `customer/*`, `shared/*`, all on TanStack Query
  talking to `/api/*` (`src/lib/api.ts`). `shared/Communities.tsx` is the one screen with a
  browser-facing Supabase client (`src/lib/realtime.ts`, anon key) — Realtime `postgres_changes`
  for live chat messages; everything else polls.
- Auth token is a demo-only bearer token in localStorage (see `api/_lib/auth.ts`); the
  `sessions` table is our own, not Supabase Auth. OTP delivery/verification itself is real when
  Twilio is configured (below) — only the session mechanism is demo-grade.

## Environment variables

Local dev reads `app/.env.local` (git-ignored); on Vercel, set these as project env vars.

| Key | Purpose | Fallback if unset |
| --- | --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Server-side `supabaseAdmin` client (`api/_lib/supabase.ts`) — required | App can't run |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Browser Realtime client for chat only (`src/lib/realtime.ts`) — required | Chat Realtime won't connect |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Real phone-OTP SMS via Twilio Verify (`api/_lib/sms.ts`) | Mock: code shown on screen, no SMS sent |
| `OTP_TEST_NUMBERS` | Reserved test numbers (`"+91...:123456,..."`) that bypass Twilio entirely | No test bypass |
| `NVIDIA_API_KEY` (+ optional `NVIDIA_MODEL`) | Preferred LLM for new-skill translation (`api/_lib/translate.ts`) | Falls through to Anthropic → Gemini → keyless MyMemory → offline echo |
| `ANTHROPIC_API_KEY` | Fallback LLM for skill translation | ↑ |
| `GEMINI_API_KEY` | Fallback LLM for skill translation | ↑ |

All three Twilio values must be set together — the app checks for the full set before
attempting real SMS (see `twilioConfigured()` in `api/_lib/sms.ts`).

## Deploying to Vercel

Two project settings are **not** in this repo and must be set in the Vercel dashboard —
without them the deploy fails or ships broken:

1. **Root Directory = `app`.** The repo root holds `app/`, `docs/` and `AGENTS.md`; if the
   project root is left at the repo root, Vercel finds no `package.json` or `api/`.
2. **Environment variables** — all four from the table above, on every environment you
   deploy (Production/Preview). The two `VITE_*` values are inlined into the bundle at
   build time, so a missing one produces a silently broken frontend rather than a build
   error; `SUPABASE_*` are read at runtime and throw on the first request if absent.

`vercel.json` covers the rest: Vite framework preset, `dist` output, and the SPA rewrite.

The SPA rewrite is written `/((?!api/).*)` → `/index.html` rather than a plain `/(.*)`.
Each API route is an exact filesystem match and the filesystem is checked before rewrites,
so a plain catch-all also works — but excluding `/api/` is cheap insurance. If API calls ever
start returning the app shell instead of JSON, this line is the first thing to check: the
symptom is a green build and a ● Ready deployment serving `index.html` from every endpoint.

### Keep one file per route

It is tempting to collapse these 32 functions into a single `api/[...path].ts` catch-all
that dispatches internally — fewer cold starts, and it dodges the Hobby plan's 12-function
cap. **It does not work on this project.** Vercel builds the catch-all happily
(`λ api/[...path]` appears in the build output) and then never routes to it: every
`/api/*` request returns Vercel's own `NOT_FOUND`, with no invocation and no runtime logs.
A static `api/ping.ts` deployed alongside it returned 200 from the same deployment, which
isolates the cause to catch-all routing rather than `/api` routing in general.

For the record, the 12-function cap is not a live constraint here: all 32 functions deploy
successfully.

`scripts/dev-api-server.ts` mirrors the same file-based routing locally, so dev and
production run the identical handler files.
