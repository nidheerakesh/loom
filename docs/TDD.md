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
  Member / Coordinator   │             Frontend (PWA)               │
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

**Node labels**

| Label | Key properties |
| --- | --- |
| `Member` | `id`, `name`, `phone_hash`, `available`, `home_location_id`, `group_id` |
| `Skill` | `id`, `canonical_name`, `embedding_id` |
| `Group` | `id`, `name`, `cds_id` |  *(SHG)* |
| `CDS` | `id`, `name`, `panchayat` |  *(cluster)* |
| `Opportunity` | `id`, `title`, `size`, `deadline`, `pay`, `location_id`, `status` |
| `Location` | `id`, `lat`, `lng`, `label` |

**Relationships (typed edges)**

| Edge | From → To | Meaning |
| --- | --- | --- |
| `HAS_SKILL` | Member → Skill | with property `proficiency` |
| `MEMBER_OF` | Member → Group | |
| `BELONGS_TO` | Group → CDS | cluster membership |
| `REQUIRES_SKILL` | Opportunity → Skill | with property `quantity` |
| `LOCATED_AT` | Member/Opportunity → Location | |
| `NEAR` | Location → Location | with property `distance_km` (precomputed within cluster) |

This is the "heterogeneous graph of women, skills, groups, and opportunities with typed edges such as has-skill, member-of, requires-skill, and near" from the concept doc, made concrete.

### 5.2 Relational + vector (PostgreSQL + pgvector)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `members` | Member metadata mirror | `id`, `phone_hash`, `name`, `group_id`, `available`, `created_at` |
| `skills` | Skill catalogue | `id`, `canonical_name`, `icon_key` |
| `skill_embeddings` | pgvector store | `skill_id`, `embedding vector(768)` |
| `opportunities` | Opportunity metadata | `id`, `title`, `size`, `pay`, `deadline`, `location_id`, `status`, `posted_by` |
| `opportunity_embeddings` | pgvector store | `opportunity_id`, `embedding vector(768)` |
| `matches` | **Audit log** (see §7) | `id`, `type`, `member_id`, `opportunity_id`, `score_json`, `path_json`, `created_at` |
| `teams` | Assembled teams | `id`, `opportunity_id`, `status`, `rationale_json`, `created_at` |
| `team_members` | Team composition | `team_id`, `member_id`, `assigned_skill_id`, `status` |
| `narrations` | Cached narration + audio ref | `match_id`, `lang`, `text`, `audio_url`, `grounded` |
| `interests` | Expressed interest | `member_id`, `opportunity_id`, `created_at` |
| `otp_sessions` | Phone-OTP (if self-managed) | `phone_hash`, `code_hash`, `expires_at` |
| `audit_events` | System audit trail | `id`, `actor`, `action`, `entity`, `payload_json`, `created_at` |

**Source of truth:** the graph (Neo4j) is authoritative for *structure and matching*; Postgres holds metadata, embeddings, and the immutable match/audit records. Writes go through the graph service, which mirrors metadata into Postgres in the same request.

---

## 6. Matching engine

### 6.1 Individual matching

1. Embed the member's skills (LaBSE) → member skill vector(s).
2. Vector search in `opportunity_embeddings` (pgvector, cosine) for semantically close opportunities → candidate set. This is what lets "stitching" surface a "garment finishing" order.
3. Filter candidates in Neo4j by `NEAR` distance within the cluster and by `available`/`status`.
4. Score each candidate:
   `score = w_skill · skill_fit + w_dist · proximity + w_earn · normalized_pay`
   (weights in config; deterministic).
5. Rank, take top-k, write a `matches` record per surfaced result, return the feed.

### 6.2 Team assembly (collective matching)

Triggered when an opportunity's `REQUIRES_SKILL` quantities exceed any single member's capacity.

**Formulation.** Constrained weighted set-cover over the cluster subgraph:

- **Universe:** the multiset of required skill-units for the opportunity.
- **Sets:** each available member contributes the skill-units they can cover (from `HAS_SKILL`).
- **Constraints:** cover all required units; respect availability; members within cluster `NEAR` bounds of the opportunity location.
- **Objective:** minimise `α · team_size + β · total_distance − γ · skill_fit`.

**Algorithm.**
1. Build the candidate member set for the cluster (skills ∩ requirements, available, within distance).
2. Greedy set-cover for a fast feasible team.
3. If instance size ≤ threshold, run PuLP/OR-Tools ILP for an optimal team; else keep greedy.
4. Emit a `MatchRecord` with the chosen team, per-member assigned skill, coverage proof, and the graph path connecting members → groups → opportunity.
5. Write `teams` + `team_members`; leave `status = proposed` for coordinator confirmation.

Everything here is deterministic and seeded, so the same input always yields the same team — essential for auditability and for the narration to be truthful.

### 6.3 Match record (the contract with narration)

```json
{
  "match_id": "…",
  "type": "individual | team",
  "opportunity": { "id": "…", "title": "…", "size": 200, "pay": "…", "distance_km": 3.1 },
  "member": { "id": "…", "name": "…" },                     // individual
  "team": [ { "member_id": "…", "name": "…", "group": "…",   // team
              "assigned_skill": "stitching", "distance_km": 2.4 } ],
  "coverage": { "required": {…}, "covered": {…}, "complete": true },
  "path": [ ["Member:…","HAS_SKILL","Skill:stitching"], … ], // for animation + narration
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
| `POST /input/transcribe` | Audio → Malayalam transcript → extracted skills | member |
| `GET  /skills` | Skill catalogue (with `icon_key`) for icon UI | member |
| `POST /members/me/skills` | Set member skills (from voice or icons) | member |
| `PATCH /members/me/availability` | Toggle availability | member |
| `GET  /matches/individual` | Ranked individual feed for current member | member |
| `GET  /matches/{id}/narration` | Malayalam text + audio URL + path | member |
| `POST /matches/{id}/interest` | Express interest | member |
| `POST /opportunities` | Create opportunity (form or voice) | coordinator |
| `POST /opportunities/{id}/assemble` | Run team assembly → proposed team | coordinator |
| `GET  /teams/{id}` | Proposed/confirmed team + rationale | coordinator/member |
| `POST /teams/{id}/confirm` | Confirm team | coordinator |
| `POST /teams/{id}/members/{mid}/respond` | Accept/decline invite | member |
| `GET  /coordinator/opportunities/{id}/interests` | Interested members | coordinator |
| `GET  /health` | Liveness + provider health | public |

All responses are JSON; audio is returned as a signed URL, not inline. Requests carry a request ID that propagates into logs and the audit trail.

---

## 9. Synthetic seed data

A reproducible, seeded generator (`scripts/seed.py`) produces one plausible CDS cluster:

- ~6–10 SHGs, ~60–120 members, distributed across ~15 locations with `NEAR` distances.
- A Malayalam-aware skill taxonomy (stitching, tailoring, garment finishing, cooking, catering, craft, packaging, tutoring, food processing…) with icon keys.
- Members assigned 1–4 skills with proficiency.
- A mix of opportunities: individual-sized and at least one large order (e.g. 200-piece uniform) that *requires a team* — guaranteeing the demo's collective match.
- Deterministic (`--seed`) so demos and tests are reproducible.

The generator writes to Neo4j + Postgres via the same services the app uses — no special-case ingestion — so the data path is exercised end-to-end. Field names match anticipated Kudumbashree data to make later replacement a config/import change, not a rewrite.

---

## 10. Security, privacy, and consent

- **Auth:** phone-OTP only; store `phone_hash` (salted), never raw numbers in the graph.
- **PII minimisation:** graph holds identifiers and skills, not sensitive personal data.
- **Cross-group visibility consent:** a member's profile is matchable across groups only if consent flag is set (see PRD open question); default per pilot policy.
- **No PII in URLs;** audio via signed, expiring URLs.
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
- Live opportunity ingestion from panchayat/federation feeds.
- Reputation, reliability, and fair-rotation edges.
- Additional languages/federations (adapters + i18n already abstract this).
