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

# Terminal 1 — local API server (dispatches through api/_routes, same as production)
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
- `api/` — the backend, deployed as a **single** Vercel Serverless Function:
  - `[...path].ts` — the only file Vercel turns into a function; it dispatches every
    `/api/*` request through the route map. See "Why one function" under Deploying.
  - `_routes/` — the actual handlers, one group per resource (`auth/`, `providers/`,
    `customers/`, `skills/`, `requests/`, `matching/`, `team-assembly/`, `narration/`,
    `ratings/`, `grievances/`, `chat/`), plus `index.ts` mapping path → handler.
  - `_lib/` — shared `supabaseAdmin` client, auth, scoring, geo, skill-text matching, LLM
    translation fallback chain.

  Underscore-prefixed directories are excluded from Vercel's function detection, so only
  `[...path].ts` ships as a function. A new route needs an entry in `_routes/index.ts` —
  it is not picked up from the filesystem.
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
The rewrite (`/(.*)` → `/index.html`) is evaluated *after* the filesystem check, so it does
not shadow `/api/*`.

### Why one function

Vercel creates one Serverless Function per file under `api/`, and the Hobby plan caps a
deployment at **12**. This API has 32 routes, so the original file-per-route layout could
build fine and then fail the deploy on the function limit. All handlers therefore live in
`api/_routes/` (underscore = not a function) behind the single `api/[...path].ts` entry
point, which also means one warm instance serves every route instead of 32 cold starts.

`scripts/dev-api-server.ts` dispatches through that same `_routes/index.ts` map, so local
dev and production run identical handlers with identical routing.
