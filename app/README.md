# Loom — runnable demo (Convex + React)

Two-sided marketplace for women's SHG skill networks: **Providers** (a woman or a shop)
offer skills; **Customers** browse, filter, and request work; large/group orders assemble a
cross-group **team**. Skill synonyms merge to one canonical skill; matches are narrated in
Malayalam. Externals (STT/TTS/LLM, embeddings) are **mocked**; all matching is deterministic.

> Stack note: this build uses Convex + React/Vite (diverges from `docs/TDD.md`, which specs
> FastAPI/Neo4j). See `docs/TDD.md §3` implementation note.

## Run locally

```bash
cd app
npm install                 # first time only

# Terminal 1 — Convex backend (anonymous local, no login/keys)
CONVEX_AGENT_MODE=anonymous npx convex dev

# once it prints "Convex functions ready", seed deterministic demo data:
CONVEX_AGENT_MODE=anonymous npx convex run seed:run

# Terminal 2 — frontend
npx vite --port 5173
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

- `convex/` — schema + deterministic backend (skills resolver, matching, team assembly,
  requests, chat, ratings, grievances, mock narration, seed).
- `src/features/` — `SignIn`, `provider/*`, `customer/*`, `shared/*`.
- Mock auth is demo-only (bearer token in localStorage); swap for Convex Auth in production.
