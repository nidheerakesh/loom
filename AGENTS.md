# AGENTS.md — Loom

Context file for AI coding agents (Claude Code, Cursor, Codex, etc.) working in this repo.
Read this before writing code. Read `docs/PRD.md`, `docs/TDD.md`, `docs/USER_FLOWS.md`, and `docs/UI_UX_DESIGN.md` for the full picture.

---

## Your role

You are a contributor building **Loom**, an AI matching engine that routes income through women's self-help group networks. You surface individual work and **assemble cross-group teams** for orders no one can do alone, and you explain every match in spoken Malayalam.

Build to the design docs. Prefer small, correct, well-typed changes over large speculative ones. When a task is ambiguous, state your assumption and proceed; when it conflicts with a rule below, stop and ask.

---

## The one rule that defines this product

**The graph decides; the LLM narrates.** All match correctness is deterministic and lives in the graph + match engine, and is written to an immutable match record **before** any text is generated. The narration layer (LLM + TTS) may only restate facts already present in that record — it can never change, invent, or influence a match. If a change would let the LLM affect *which* match is produced, do not make it; raise it instead.

---

## Hard conventions

- **File size:** keep every source file **under 400 lines**. Split by responsibility before you exceed it.
- **Types everywhere:** Python fully type-hinted (Pydantic v2 for models); TypeScript in `strict` mode. No `any`, no untyped public functions.
- **Determinism:** matching, scoring, and team assembly must be deterministic and seedable. Same input + seed → same output. No randomness without an injected seed.
- **Secrets:** never hardcode or commit API keys, tokens, or credentials. Everything sensitive comes from environment variables via `settings.py` / `.env` (git-ignored). Do not print secrets in logs. *(This repo's team has hit GitHub secret-scanning before — treat this as non-negotiable and scan diffs before committing.)*
- **Adapters for externals:** all STT / TTS / LLM / DB access goes through the interfaces in `services/` (see TDD §4). Never call a provider SDK directly from a route or component.
- **Malayalam-first UX:** every P0 member flow must be completable with voice + icons, no English reading required. User-facing strings go in the i18n catalogue, never hardcoded in components.
- **No PII in URLs or logs;** store `phone_hash`, never raw phone numbers, in the graph.

---

## Tech stack (don't substitute without asking)

- **Backend:** Python 3.11, FastAPI, Pydantic v2, async, Uvicorn.
- **Graph:** Neo4j (driver behind a `GraphRepository` interface; tests may use an in-memory/NetworkX double).
- **Relational + vector:** PostgreSQL 16 + pgvector.
- **Embeddings:** `sentence-transformers` LaBSE, in-process.
- **Team solver:** greedy set-cover + PuLP/OR-Tools exact fallback.
- **STT/TTS:** Bhashini/AI4Bharat (Google Cloud `ml-IN` fallback).
- **LLM narration:** Gemini (grounded, low temperature).
- **Frontend:** React 18 + Vite + TypeScript, Tailwind, Cytoscape.js, `react-i18next`, Workbox PWA.

`node2vec` / PyTorch Geometric / GNN are **future scope** — do not add them to v1 unless explicitly asked.

---

## Folder structure

```
loom/
├── AGENTS.md
├── docs/
│   ├── PRD.md
│   ├── TDD.md
│   ├── USER_FLOWS.md
│   └── UI_UX_DESIGN.md
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + router mount only
│   │   ├── settings.py          # the ONLY place env vars are read
│   │   ├── api/                 # routers, one file per resource (<400 lines)
│   │   │   ├── auth.py  input.py  members.py  matches.py
│   │   │   ├── opportunities.py  teams.py  coordinator.py  health.py
│   │   ├── models/              # Pydantic schemas + domain types
│   │   ├── services/            # business logic + provider adapters
│   │   │   ├── graph.py         # GraphRepository (Neo4j) interface + impl
│   │   │   ├── embeddings.py    # LaBSE embedder
│   │   │   ├── matching/        # individual.py, team_assembly.py, scoring.py
│   │   │   ├── narration.py     # Gemini narrator + groundedness validator
│   │   │   ├── stt.py  tts.py   # adapters (Bhashini/Google)
│   │   │   └── audit.py         # match + event logging
│   │   └── db/                  # Postgres access, migrations
│   ├── scripts/seed.py          # synthetic data generator (seeded)
│   └── tests/                   # mirrors app/ ; pytest
├── frontend/
│   ├── src/
│   │   ├── main.tsx  App.tsx
│   │   ├── pages/               # Home, MatchDetail, Skills, Teams, ...
│   │   ├── components/          # MatchCard, MicButton, GraphPath, TeamPanel...
│   │   ├── graph/               # Cytoscape setup + woven-path animation
│   │   ├── i18n/                # ml.json (primary), en.json (fallback)
│   │   ├── api/                 # typed client for /api/v1
│   │   └── hooks/  state/
│   └── public/icons/            # skill + nav icon set
├── docker-compose.yml
└── .env.example
```

Keep this structure. New backend logic → `services/`; new endpoints → thin routers in `api/` that call services. New UI → a component in `components/` or a page in `pages/`; no business logic in components.

---

## Coding conventions

**Python**
- `ruff` + `black`; import order enforced by ruff.
- Routers are thin: validate, call a service, return. No business logic in `api/`.
- Pydantic models for every request/response and every domain record (esp. the match record — it's a contract).
- Raise typed domain errors; map to HTTP in one place.
- No comments that restate code; comment *why*, not *what*.

**TypeScript / React**
- Functional components + hooks only. No class components.
- `strict` TS; props typed; no `any`.
- ESLint + Prettier. Tailwind utility classes; design tokens from `UI_UX_DESIGN.md` (define them once in the Tailwind theme, never hardcode hex in components).
- All user-facing text via `react-i18next`; no literal Malayalam/English strings in JSX.

**General**
- Short, clear names.
- One responsibility per file; split before 400 lines.

---

## Testing (required with every change)

- Add/'update tests alongside code. `pytest` (backend), component/unit tests (frontend).
- **Property tests** for the solver: coverage completeness + determinism.
- A **golden test** locks the demo collective match (≥3 women, ≥2 groups) stable given the seed.
- Provider adapters tested against mocks; no live provider calls in the default test run.
- CI runs lint + type-check + tests; a change isn't done until these pass.

---

## Definition of done

- [ ] Types complete; lint + type-check clean.
- [ ] Tests added and passing (incl. determinism where relevant).
- [ ] No secrets in diff; nothing sensitive logged.
- [ ] LLM/narration changes preserve "graph decides, LLM narrates."
- [ ] Member-facing UI works via voice + icons; strings in i18n.
- [ ] Files under 400 lines.
- [ ] Docs updated if behaviour or API changed.

---

## Commits / PRs

- Small, focused commits; imperative messages (`add team-assembly solver`, not `added stuff`).
- One logical change per PR; describe what and why, link the doc section.
- Never force-push shared branches; never commit `.env` or generated audio.

---

## When to stop and ask

- A change would let the LLM influence which match is produced.
- You'd need to add a secret, a new external provider, or a new heavy dependency (GNN libs, etc.).
- The synthetic-data schema would diverge from anticipated Kudumbashree fields.
- A member flow would require reading English to complete.
