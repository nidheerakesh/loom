# Loom — Technical Design Document (TDD)

**Version:** 1.0 (production-ready foundation)
**Companion docs:** `PRD.md`, `USER_FLOWS.md`, `UI_UX_DESIGN.md`, `../AGENTS.md`

---

## 1. Design principles

1. **The graph decides; the LLM narrates.** All match correctness is fixed in a deterministic layer and logged *before* any text is generated. Narration reads from that record and cannot alter it.
2. **Cluster-scoped by default.** Matching and team search run over one CDS cluster's subgraph to bound cost.
3. **Voice/icon first.** Every write path (skills, opportunities) has a non-text entry mode.
4. **Swap the data, not the system.** Synthetic seed data conforms to the same schema real Kudumbashree data will. The generator is a fixture, never a runtime dependency.
5. **Small, typed, tested.** ≤400 lines/file, full type hints, tests for every service (see `AGENTS.md`).

---

## 2. High-level architecture

```
                         ┌──────────────────────────────────────────┐
  Provider / Customer    │             Frontend (PWA)               │
  (low-end Android) ────► │  React + Vite + TS · Cytoscape.js · i18n │
                         └───────────────┬──────────────────────────┘
                                         │ HTTPS / JSON
                                 ┌───────▼────────┐
                                 │  API Gateway   │  FastAPI (async)
                                 │  /api/v1/*     │  auth · rate-limit · validation
                                 └───┬───┬───┬────┘
             ┌───────────────────────┘   │   └────────────────────────┐
     ┌───────▼────────┐        ┌─────────▼────────┐          ┌─────────▼─────────┐
     │ Input & Skill  │        │  Match Engine    │          │  Narration Svc    │
     │ Extraction     │        │  individual +    │          │  LLM (grounded)   │
     │  STT → skills  │        │  team assembly   │          │  + Malayalam TTS  │
     └───────┬────────┘        └───┬──────────┬───┘          └─────────┬─────────┘
             │                     │          │                        │
     ┌───────▼─────────┐   ┌───────▼───┐  ┌───▼──────────┐    ┌────────▼────────┐
     │ Embedding Svc   │   │ Graph Svc │  │ Postgres     │    │ Match Audit Log │
     │ LaBSE (in-proc) │   │  Neo4j    │  │ + pgvector   │    │ (Postgres)      │
     └─────────────────┘   └───────────┘  └──────────────┘    └─────────────────┘
```

**Data flow.** Voice/icon input → skill extraction → structured skill nodes → embeddings → match engine queries the graph (Neo4j) and vector index (pgvector) → deterministic match record written to audit log → narration service renders Malayalam text + audio → frontend animates the path and plays audio.

---

## 3. Technology stack

> **Implementation note (v-next demo, `app/`).** A runnable reference build lives in `app/`
> and **diverges from the stack below**: it uses **Convex** (DB + reactivity + auth + file
> storage) with **React + Vite + TypeScript + Tailwind**, instead of FastAPI + Neo4j +
> Postgres + pgvector. The heterogeneous graph is modeled as Convex tables; matching,
> provider search, skill canonicalization, and team assembly run as deterministic Convex
> queries/mutations. Externals (STT/TTS/LLM narration, embeddings) are **mocked** behind
> swappable interfaces — a deterministic trigram similarity stands in for LaBSE cosine, and a
> template narrator stands in for Gemini. Phone-OTP is mocked (code logged in dev). The
> design below remains the target production architecture; the Convex build is the fast path
> to a locally runnable demo and preserves the core rule (graph decides, deterministic;
> narrator only restates the match record). See `app/AGENTS.md`.


| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | React 18 + Vite + TypeScript, Tailwind CSS, Cytoscape.js, `react-i18next`, Workbox (PWA) | Installable, offline-tolerant shell |
| Backend | Python 3.11, FastAPI, Pydantic v2, Uvicorn (async) | ≤400 lines/file, typed |
| Graph store | Neo4j 5 (Aura managed in prod) via `neo4j` driver | Traversal + team-assembly queries |
| Relational + vector | PostgreSQL 16 + `pgvector` (Supabase) | Metadata, matches, audit, embeddings |
| Embeddings | `sentence-transformers` LaBSE (multilingual, Malayalam-capable), served in-process | 768-dim; cached |
| Team-assembly solver | Greedy set-cover + PuLP/OR-Tools exact fallback (bounded) | Deterministic, seeded |
| STT | Bhashini ASR (AI4Bharat IndicConformer) → Google Cloud STT `ml-IN` fallback | Malayalam |
| TTS | Bhashini TTS / Sarvam → Google Cloud TTS `ml-IN` fallback | Malayalam |
| LLM narration | Gemini API (grounded, low temperature, constrained) | Narrates match record only |
| Auth | Phone-OTP (Supabase Auth or Firebase Auth) | No passwords |
| Infra | Docker, Vercel (frontend), Render/Railway/Fly (API), Neo4j Aura, Supabase | Managed |
| Observability | `structlog` JSON logs, request IDs, OpenTelemetry-ready | Audit-grade |

> Provider note: exact Bhashini/Sarvam/Gemini endpoints, quotas, and pricing change — verify against current provider docs at integration time. The architecture depends on the *capability* (Malayalam STT/TTS/LLM), not a specific endpoint, and every external provider sits behind an adapter interface so it can be swapped.

**Deferred (future scope):** node2vec / PyTorch Geometric heterogeneous embeddings and a trained GNN, once match-outcome data exists. v1 uses semantic embeddings + graph search, which need no training data.

---

## 4. External provider adapters

Each external capability is wrapped in an interface so providers are swappable and testable (mock in tests).

```python
class SpeechToText(Protocol):
    async def transcribe(self, audio: bytes, lang: str = "ml") -> Transcript: ...

class TextToSpeech(Protocol):
    async def synthesize(self, text: str, lang: str = "ml") -> AudioClip: ...

class Narrator(Protocol):
    async def narrate(self, match: MatchRecord, lang: str = "ml") -> Narration: ...
```

- **STT:** `BhashiniSTT` (primary) / `GoogleSTT` (fallback), selected by config + health check.
- **TTS:** `BhashiniTTS`/`SarvamTTS` (primary) / `GoogleTTS` (fallback).
- **Narrator:** `GeminiNarrator`. The prompt is a fixed template that receives the structured match record and must return only a Malayalam explanation over the provided facts. A post-generation validator checks the narration mentions only entities present in the match record; on failure it falls back to a deterministic template narration (no LLM).

---

## 5. Data model

### 5.1 Graph (Neo4j)

> **Terminology:** `Provider` is the former `Member` (a skilled woman *or* a small shop);
> `Request` is the former `Opportunity` (Customer-created demand). Both renames are reflected
> below and in the API (§8). The matching engine (§6) is unchanged in substance.

**Node labels**

| Label | Key properties |
| --- | --- |
| `Provider` | `id`, `name`, `shop_name`, `phone_hash`, `available`, `capacity` (no. of ppl; 1 = solo), `rate`, `rate_unit`, `delivery_time`, `experience_years`, `rating` (0–5, aggregate), `languages`, `home_location_id`, `group_id` |
| `Customer` | `id`, `name`, `company`, `phone_hash`, `location_id` |
| `Skill` | `id`, `canonical_name`, `embedding_id` |
| `Group` | `id`, `name`, `cds_id` |  *(SHG)* |
| `CDS` | `id`, `name`, `panchayat` |  *(cluster)* |
| `Request` | `id`, `title`, `description`, `mode` (`individual`\|`group`), `units`, `size`, `deadline`, `pay`, `location_id`, `status`, `customer_id` |
| `Location` | `id`, `lat`, `lng`, `label` |

**Relationships (typed edges)**

| Edge | From → To | Meaning |
| --- | --- | --- |
| `HAS_SKILL` | Provider → Skill | with properties `proficiency` (graded scale, drives the experience filter) and optional per-skill `rate` |
| `MEMBER_OF` | Provider → Group | |
| `BELONGS_TO` | Group → CDS | cluster membership |
| `REQUIRES_SKILL` | Request → Skill | with property `quantity` |
| `LOCATED_AT` | Provider/Request → Location | |
| `NEAR` | Location → Location | with property `distance_km` (precomputed within cluster) |
| `POSTED` | Customer → Request | demand authorship |
| `WORKED_WITH` | Customer → Provider | history ("people you've worked with"); set on completion |

This is the "heterogeneous graph of women, skills, groups, and opportunities with typed edges such as has-skill, member-of, requires-skill, and near" from the concept doc, made concrete — extended with the Customer side and Provider marketplace attributes.

### 5.2 Relational + vector (PostgreSQL + pgvector)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `providers` | Provider metadata mirror | `id`, `phone_hash`, `name`, `shop_name`, `group_id`, `available`, `capacity`, `rate`, `rate_unit`, `delivery_time`, `experience_years`, `rating`, `languages`, `created_at` |
| `customers` | Customer metadata mirror | `id`, `phone_hash`, `name`, `company`, `location_id`, `created_at` |
| `skills` | Skill catalogue | `id`, `canonical_name`, `icon_key` |
| `skill_aliases` | Synonym → canonical map (S9) | `id`, `skill_id`, `alias_text`, `source` (`curated`\|`approved`) |
| `skill_candidates` | Below-threshold inputs for admin review (S9) | `id`, `raw_text`, `nearest_skill_id`, `similarity`, `status`, `created_at` |
| `skill_embeddings` | pgvector store | `skill_id`, `embedding vector(768)` |
| `requests` | Request (demand) metadata | `id`, `title`, `description`, `mode`, `units`, `size`, `pay`, `deadline`, `location_id`, `status`, `customer_id` |
| `request_embeddings` | pgvector store | `request_id`, `embedding vector(768)` |
| `matches` | **Audit log** (see §7) | `id`, `type`, `provider_id`, `request_id`, `score_json`, `path_json`, `created_at` |
| `teams` | Assembled teams | `id`, `request_id`, `status`, `rationale_json`, `created_at` |
| `team_members` | Team composition | `team_id`, `provider_id`, `assigned_skill_id`, `status` |
| `narrations` | Cached narration + audio ref | `match_id`, `lang`, `text`, `audio_url`, `grounded` |
| `interests` | Expressed interest / accept-decline | `provider_id`, `request_id`, `state` (`interested`\|`accepted`\|`declined`), `created_at` |
| `ratings` | Customer → Provider reviews (S12) | `id`, `provider_id`, `customer_id`, `stars`, `comment`, `created_at` |
| `portfolio_items` | Provider "upload work" (M14) | `id`, `provider_id`, `image_url`, `caption`, `created_at` |
| `grievances` | Grievance portal (M16) | `id`, `reporter_id`, `reporter_role`, `subject`, `body`, `status`, `created_at` |
| `chat_threads` | Community chat (M10) | `id`, `context_type` (`provider`\|`request`\|`team`), `context_id`, `created_at` |
| `messages` | Chat messages | `id`, `thread_id`, `sender_id`, `sender_role`, `body`, `created_at`, `read_at` |
| `otp_sessions` | Phone-OTP (if self-managed) | `phone_hash`, `code_hash`, `expires_at` |
| `audit_events` | System audit trail | `id`, `actor`, `action`, `entity`, `payload_json`, `created_at` |

Images (`portfolio_items.image_url`) are stored as signed, expiring URLs — the same pattern as narration audio (§8), never inline. `WORKED_WITH` history (§5.1) is the source for the Customer's "people you've worked with" view; it can also be materialised as a read-model if needed.

**Source of truth:** the graph (Neo4j) is authoritative for *structure and matching*; Postgres holds metadata, embeddings, and the immutable match/audit records. Writes go through the graph service, which mirrors metadata into Postgres in the same request.

---

## 6. Matching engine

### 6.0 Skill resolution (canonicalization — S9)

Runs at **skill-entry time**, before anything is matched, so the catalogue never fragments
into synonyms ("tailoring" / "stitching" / "garment sewing" → one `Skill`). Deterministic:

1. Normalise the extracted phrase (lowercase, trim, Malayalam+Latin).
2. **Exact / alias match** against `skills.canonical_name` and `skill_aliases.alias_text`
   → resolved (fast path).
3. Else embed the phrase (LaBSE) and take cosine similarity to existing canonical skills.
   If the top match ≥ `SKILL_MERGE_THRESHOLD` (config) → resolve to it.
4. Else write a `skill_candidates` row (with `nearest_skill_id` + `similarity`) for admin
   review — **never** silently create a fragmented duplicate skill.

The threshold is config and fixed per run, so resolution is deterministic and seedable.
An **offline** script may use an LLM to *propose* new aliases for a curator to approve into
`skill_aliases`; the runtime resolver never calls an LLM (preserves "the graph decides").

### 6.1 Individual matching

1. Embed the provider's skills (LaBSE) → provider skill vector(s). (Skills are already
   canonicalised via §6.0.)
2. Vector search in `request_embeddings` (pgvector, cosine) for semantically close requests
   → candidate set. This is what lets "stitching" surface a "garment finishing" request.
3. Filter candidates in Neo4j by `NEAR` distance within the cluster and by `available`/`status`.
4. Score each candidate:
   `score = w_skill · skill_fit + w_dist · proximity + w_earn · normalized_pay`
   (weights in config; deterministic).
5. Rank, take top-k, write a `matches` record per surfaced result, return the feed.

### 6.2 Team assembly (collective matching)

Triggered when a request is marked `mode = group`, **or** when its `REQUIRES_SKILL`
quantities / `units` exceed the `capacity` any single Provider can cover. (The Customer's
group/individual toggle and `units`, §4.2 C1, are the explicit trigger inputs; the
quantity-exceeds-capacity auto-detect remains the fallback.)

**Formulation.** Constrained weighted set-cover over the cluster subgraph:

- **Universe:** the multiset of required skill-units for the request.
- **Sets:** each available Provider contributes the skill-units they can cover (from `HAS_SKILL`), up to their `capacity` (a shop with `capacity = n` can cover up to n units of a skill).
- **Constraints:** cover all required units; respect availability and per-Provider `capacity`; Providers within cluster `NEAR` bounds of the request location.
- **Objective:** minimise `α · team_size + β · total_distance − γ · skill_fit`.

**Algorithm.**
1. Build the candidate Provider set for the cluster (skills ∩ requirements, available, within distance), each with its `capacity`.
2. Greedy set-cover for a fast feasible team.
3. If instance size ≤ threshold, run PuLP/OR-Tools ILP for an optimal team; else keep greedy.
4. Emit a `MatchRecord` with the chosen team, per-Provider assigned skill + covered units, coverage proof, and the graph path connecting Providers → groups → request.
5. Write `teams` + `team_members`; leave `status = proposed` for Customer confirmation.

Everything here is deterministic and seeded, so the same input always yields the same team — essential for auditability and for the narration to be truthful.

### 6.4 Provider search (directory + filters — S10)

Powers the Customer "Browse" surface. Given a skill (and optional filters), return matching
Providers, **filter-then-rank**, fully deterministic:

1. Resolve the searched skill via §6.0, then find Providers with a matching/`REQUIRES_SKILL`-compatible `HAS_SKILL` (semantic match via §6.1 step 2 applies).
2. Apply **hard filters** (all deterministic):
   - `distance` — `NEAR` `distance_km` ≤ `max_distance_km`.
   - `experience` — `experience_years` (or graded `HAS_SKILL.proficiency`) ≥ `min_experience`.
   - `price` — `rate` (or per-skill rate) ≤ `max_rate`.
3. Rank the surviving set with the same weighted score as §6.1 (`skill_fit`, `proximity`,
   `pay`/rate); `rating` is **display-only** and does not enter the score unless explicitly
   configured (open question, PRD §10).

Filters are constraints, not learned ranking — the graph still decides, deterministically.

### 6.3 Match record (the contract with narration)

```json
{
  "match_id": "…",
  "type": "individual | team",
  "request": { "id": "…", "title": "…", "mode": "group", "units": 200, "pay": "…", "distance_km": 3.1 },
  "provider": { "id": "…", "name": "…" },                    // individual
  "team": [ { "provider_id": "…", "name": "…", "group": "…", // team
              "assigned_skill": "stitching", "covered_units": 40, "distance_km": 2.4 } ],
  "coverage": { "required": {…}, "covered": {…}, "complete": true },
  "path": [ ["Provider:…","HAS_SKILL","Skill:stitching"], … ], // for animation + narration
  "scores": { "skill_fit": 0.86, "proximity": 0.79, "pay": 0.6 }
}
```

The narration service may state **only** facts present in this object.

---

## 7. Grounded narration & audit

1. Match engine writes an immutable `matches` row (the record above) — **before** any text generation.
2. Narration service loads the record, fills the fixed Malayalam prompt template, calls Gemini at low temperature.
3. **Groundedness validator:** parses the narration for named entities/quantities and confirms each appears in the match record. On failure → deterministic template narration (Malayalam string built directly from the record, no LLM).
4. TTS synthesizes the (validated) text; cache `narrations` row with `grounded=true/false` and `audio_url`.
5. Frontend plays audio and animates `path`.

This guarantees goal **G4**: 100% of narrations trace to a logged graph decision and the LLM cannot change a match.

---

## 8. API surface (`/api/v1`)

| Method & path | Purpose | Auth |
| --- | --- | --- |
| `POST /auth/otp/request` | Send OTP to phone | public |
| `POST /auth/otp/verify` | Verify OTP → session token | public |
| `POST /input/transcribe` | Audio → Malayalam transcript → extracted skills | provider |
| `GET  /skills` | Skill catalogue (with `icon_key`) for icon UI | any |
| `POST /providers/me/skills` | Set provider skills (canonicalised via §6.0) | provider |
| `PATCH /providers/me` | Edit profile (shop name, capacity, rate, delivery, languages) | provider |
| `PATCH /providers/me/availability` | Toggle availability | provider |
| `POST /providers/me/portfolio` | Upload work image (→ signed URL) | provider |
| `GET  /matches/individual` | Ranked individual feed for current provider | provider |
| `GET  /matches/{id}/narration` | Malayalam text + audio URL + path | provider |
| `POST /matches/{id}/interest` | Express interest | provider |
| `GET  /providers/me/requests` | Incoming direct requests | provider |
| `POST /requests/{id}/respond` | Accept ✓ / decline ✗ a direct request | provider |
| `GET  /providers` | Directory search + filters (`?skill=&max_distance_km=&min_experience=&max_rate=`) | customer |
| `GET  /providers/{id}` | Provider profile (skills, rate, delivery, portfolio, rating) | customer |
| `POST /providers/{id}/ratings` | Leave a rating/review | customer |
| `POST /requests` | Create request (form or voice; `mode`, `units`, …) | customer |
| `POST /requests/{id}/assemble` | Run team assembly → proposed team | customer |
| `GET  /teams/{id}` | Proposed/confirmed team + rationale | customer/provider |
| `POST /teams/{id}/confirm` | Confirm team | customer |
| `POST /teams/{id}/members/{mid}/respond` | Accept/decline invite | provider |
| `GET  /customers/me/requests?status=` | Customer's requests (e.g. `accepted`) | customer |
| `GET  /customers/me/history` | "People you've worked with" | customer |
| `GET  /customers/requests/{id}/interests` | Providers who expressed interest/accepted | customer |
| `GET/POST /chat/threads` | List / open a chat thread | provider/customer |
| `GET/POST /chat/threads/{id}/messages` | Read / send messages | provider/customer |
| `POST /grievances` | Submit a grievance | provider/customer |
| `GET  /grievances/me` | Track own grievances | provider/customer |
| `GET  /health` | Liveness + provider health | public |

All responses are JSON; audio **and portfolio images** are returned as signed, expiring URLs, not inline. Requests carry a request ID that propagates into logs and the audit trail. (`/requests` was formerly `/opportunities`; `/providers/me/*` was formerly `/members/me/*`.)

---

## 9. Synthetic seed data

A reproducible, seeded generator (`scripts/seed.py`) produces one plausible CDS cluster:

- ~6–10 SHGs, ~60–120 **Providers** (a mix of solo `capacity = 1` and multi-person shops `capacity > 1`), distributed across ~15 locations with `NEAR` distances.
- A Malayalam-aware skill taxonomy (stitching, tailoring, garment finishing, cooking, catering, craft, packaging, tutoring, food processing…) with icon keys **and seeded aliases** (S9) so synonym-merge is exercised.
- Providers assigned 1–4 skills with proficiency, plus `experience_years`, `rate`, `delivery_time`, and a few `portfolio_items` and `ratings`.
- A handful of **Customers** posting **requests**: individual-sized and at least one `group` request (e.g. 200-piece uniform) whose `units` exceed any single Provider's `capacity` — guaranteeing the demo's collective match.
- Deterministic (`--seed`) so demos and tests are reproducible.

The generator writes to Neo4j + Postgres via the same services the app uses — no special-case ingestion — so the data path is exercised end-to-end. Field names match anticipated Kudumbashree data to make later replacement a config/import change, not a rewrite.

---

## 10. Security, privacy, and consent

- **Auth:** phone-OTP only; store `phone_hash` (salted), never raw numbers in the graph.
- **PII minimisation:** graph holds identifiers and skills, not sensitive personal data.
- **Cross-group visibility consent:** a Provider's profile is matchable / browsable across groups only if the consent flag is set (see PRD open question); default per pilot policy. The same flag governs Customer directory browse (§6.4).
- **Chat consent & moderation:** community chat (M10) is opt-in per participant; messages are logged for moderation; Admin can act on grievances/reports. Chat never influences a match.
- **No PII in URLs;** audio and portfolio images via signed, expiring URLs.
- **Least-privilege provider keys;** secrets via environment/secret manager, never committed. (History note for this team: prior secret-scanning incidents make this non-negotiable — see `AGENTS.md`.)
- **Audit:** every state-changing action logged to `audit_events`.

---

## 11. Deployment & environments

| Env | Frontend | API | Neo4j | Postgres |
| --- | --- | --- | --- | --- |
| Local | Vite dev | Uvicorn + Docker Compose | Neo4j container / NetworkX test double | Postgres container |
| Staging | Vercel preview | Render/Railway | Neo4j Aura (free) | Supabase |
| Prod | Vercel | Render/Railway/Fly | Neo4j Aura | Supabase |

- **Docker Compose** for local (`api`, `neo4j`, `postgres`, `frontend`).
- CI runs lint + type-check + tests on every PR; blocks merge on failure.
- Config via env vars; a single `settings.py` (Pydantic `BaseSettings`) is the only place that reads them.

## 12. Testing strategy

- **Unit:** matching scorer, set-cover solver (property tests: cover completeness, determinism), groundedness validator.
- **Contract:** provider adapters tested against mocks; one live smoke test per provider behind a flag.
- **Integration:** seed → individual match → narration; seed → large order → team assembly → confirm.
- **Golden test:** the demo collective match (≥3 women, ≥2 groups) asserted stable across runs given the seed.

## 13. Performance targets (from PRD §7)

- Individual match < 5 s p95; team assembly < 8 s p95 at cluster scale.
- Cache embeddings and narrations; precompute `NEAR` distances at seed time.
- Scope every query to a `CDS` subgraph.

## 14. Future scope (deferred, architecture-ready)

- Migrate embeddings to node2vec / PyTorch Geometric and train a GNN once outcome data exists.
- Live request ingestion from panchayat/federation feeds.
- Reliability and fair-rotation edges. *(Reputation/ratings are now active — S12, §5.2 `ratings` — but kept display-first, out of the match decision until validated.)*
- In-app payments / escrow (currently a non-goal; chat surfaces rate discussion only).
- Additional languages/federations (adapters + i18n already abstract this).
