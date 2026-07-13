# Loom — Product Requirements Document (PRD)

**Product:** Loom — AI Matching Engine for Women's Livelihood Networks
**Owner:** Nidhi Rakesh · Team: Niveditha G. S., Anjana Nandakumar
**Version:** 1.0 (production-ready foundation)
**Status:** Draft for build
**Last updated:** June 2026

---

## 1. Overview

Loom is an intelligence layer over women's self-help group (SHG) networks — starting with Kerala's Kudumbashree — that routes income through a graph of women, skills, groups, and live opportunities. It does two things no job board does: it surfaces nearby work an individual can do alone, and it **assembles cross-group teams** for orders too large for any one woman. Every match is narrated in spoken Malayalam by a grounded GenAI layer that *narrates* the graph's decision — it never makes it.

This document defines what v1 builds, for whom, and how we know it works. Architecture and data model live in `TDD.md`; step-by-step journeys in `USER_FLOWS.md`; visual design in `UI_UX_DESIGN.md`.

### 1.1 Build scope for this version

| Decision | v1 choice |
| --- | --- |
| Maturity target | Production-ready foundation (real architecture, real services) |
| Voice + language | Real Malayalam STT, TTS, and LLM narration |
| Data | Synthetic seed dataset (generated), designed to swap for real Kudumbashree data |
| Platform | Responsive PWA, optimised for low-end Android |
| Deployment | Managed cloud services, Dockerised |

The system is architected for real Kudumbashree data and scale from day one; only the *dataset* is synthetic in v1. Nothing about the schema, APIs, or matching logic is a throwaway prototype.

---

## 2. Problem & goals

### 2.1 Problem

SHG women have credit and skills but limited visibility into nearby paid demand. The highest-value, team-sized opportunities (a 200-piece uniform order, a large catering job) stay invisible because no single woman can fulfil them and no platform assembles the team. Market access — not money — is the binding constraint.

### 2.2 Goals

| # | Goal | Success signal |
| --- | --- | --- |
| G1 | Surface relevant individual work from spoken/tapped skills | Member gets ≥1 ranked match within 5s of finishing input |
| G2 | Assemble a feasible cross-group team for large orders | A demonstrable match where ≥3 women across ≥2 groups cover an order none could alone |
| G3 | Make every match understandable to low-literacy users | Each match has Malayalam voice + animated path; no English required to complete a core flow |
| G4 | Keep decisions deterministic and auditable | 100% of narrations trace to a logged graph decision; LLM cannot alter the match |
| G5 | Plug into Kudumbashree, don't replace it | Coordinator can post, review, and confirm within their cluster |

### 2.3 Non-goals (v1)

- Payments, escrow, or invoicing.
- In-app chat/messaging between women.
- Training/GNN models on outcome data (future — needs outcome history).
- Languages beyond Malayalam (architecture is language-agnostic; only Malayalam ships in v1).
- Native iOS/Android apps.

---

## 3. Users & personas

| Persona | Who | Primary needs | Access mode |
| --- | --- | --- | --- |
| **Member** (primary) | An SHG woman, often first-generation smartphone user, low English literacy | Speak her skills, find work she can do, join teams, understand *why* a match fits | Voice + icons + Malayalam audio |
| **CDS Coordinator** | Kudumbashree cluster coordinator | Post/verify opportunities, see cross-group capacity, confirm team assembly | Text + voice, Malayalam UI |
| **Admin** | Program/NGO operator | Manage clusters, seed data, monitor health, audit matches | Web dashboard |
| **Buyer / poster** (future) | Panchayat, enterprise, or individual with an order | Post demand | Deferred to future scope |

**Primary design target:** the Member. If a flow can't be completed by a low-literacy woman using voice and icons alone, it isn't done.

---

## 4. Feature requirements

Priority: **P0** = must ship in v1, **P1** = ship if time, **P2** = future.

### 4.1 Member features

| ID | Feature | Priority | Requirement |
| --- | --- | --- | --- |
| M1 | Phone-OTP onboarding | P0 | Sign in with phone number + OTP; no email, no password. Language defaults to Malayalam. |
| M2 | Voice skill entry | P0 | Speak skills in Malayalam; STT → structured skill nodes. Confirmation read back aloud. |
| M3 | Icon skill entry | P0 | Tap illustrated skill tiles (stitching, cooking, craft, tutoring, packaging…) as a voice alternative/supplement. |
| M4 | Individual match feed | P0 | Ranked nearby opportunities by skill fit, distance, earnings. Each card has a play button for Malayalam narration. |
| M5 | Match explanation | P0 | Tap a match → hear plain Malayalam explanation + see animated graph path from her to the opportunity. |
| M6 | Express interest | P0 | One-tap "I'm interested" on a match; notifies coordinator, records intent. |
| M7 | Team invitations | P0 | Receive and accept/decline invitations to join an assembled team; hear what the team is for and who's in it. |
| M8 | Availability toggle | P1 | Mark available/busy so matching respects capacity. |
| M9 | My work | P1 | List of matches expressed-interest-in and teams joined, with status. |

### 4.2 Coordinator features

| ID | Feature | Priority | Requirement |
| --- | --- | --- | --- |
| C1 | Post opportunity | P0 | Create an opportunity: required skills, quantity/size, location, deadline, pay. Voice or form entry. |
| C2 | Large-order detection | P0 | System flags opportunities exceeding any individual's capacity and offers team assembly. |
| C3 | Review assembled team | P0 | See the proposed team (which women, which groups, coverage, proximity) with the deterministic rationale before confirming. |
| C4 | Confirm/adjust team | P0 | Confirm the team or swap a member; system re-checks feasibility. |
| C5 | Cluster capacity view | P1 | Cross-group view of skills available in the cluster. |
| C6 | Interested-member inbox | P0 | See who expressed interest per opportunity. |

### 4.3 System / platform features

| ID | Feature | Priority | Requirement |
| --- | --- | --- | --- |
| S1 | Graph store | P0 | Heterogeneous graph of women, skills, groups, CDS clusters, opportunities, locations with typed edges. |
| S2 | Semantic skill matching | P0 | Match by meaning, not keywords ("stitching" ↔ "garment finishing"), via multilingual embeddings. |
| S3 | Team-assembly engine | P0 | Constrained set-cover over required skills with proximity + availability; returns the specific team. |
| S4 | Grounded narration | P0 | LLM converts a deterministic match record into Malayalam text; TTS speaks it. LLM output is constrained and cannot change the match. |
| S5 | Match audit log | P0 | Every match stores its inputs, scores, and chosen path; narration references only this record. |
| S6 | Synthetic data seeding | P0 | Reproducible generator for members, skills, groups, opportunities across a demo CDS cluster. |
| S7 | Animated graph view | P0 | Cytoscape.js view that traverses and highlights the winning path. |
| S8 | Offline tolerance | P1 | PWA caches last feed and UI shell; voice/matching require network. |

---

## 5. Key user stories

- *As a Member,* I speak "I can stitch and cook" and hear back three nearby jobs, so I can find paid work without reading English.
- *As a Member,* I get invited to a five-woman team for a uniform order, hear who's on it and what my part is, and accept in one tap.
- *As a Coordinator,* I post a 200-piece uniform order and Loom proposes a team across two groups that together cover cutting, stitching, and finishing within 3 km.
- *As a Coordinator,* I see *why* each woman is on the team before I confirm, so I trust the suggestion.
- *As an Admin,* I can trace any narration back to the exact graph decision that produced it.

---

## 6. Core differentiator (protect this)

Loom's defensible edge is **collective opportunity matching** — a class of problem single-listing job boards cannot represent and human coordinators cannot scale. Every product decision must preserve three properties:

1. **Collective-first.** Team assembly is a headline capability, not an add-on.
2. **Deterministic + explainable.** The graph decides; the LLM narrates. Never blur this.
3. **Malayalam-first, low-literacy-first.** Voice and icons are the primary interface, not an accessibility afterthought.

---

## 7. Success metrics

| Metric | Target (v1 demo/pilot) |
| --- | --- |
| Individual match latency (input end → ranked feed) | < 5 s p95 |
| Team-assembly latency (order → proposed team) | < 8 s p95 for a cluster-scale graph |
| Narration groundedness | 100% traceable to a match record; 0 fabricated facts in review set |
| Core-flow completion without English | 100% of P0 member flows |
| Malayalam STT usable-transcription rate (seed test set) | ≥ 85% |
| Demonstrable collective match | ≥ 1 team of ≥3 women across ≥2 groups, live |

---

## 8. Assumptions & dependencies

- Real STT/TTS/LLM providers are reachable and support Malayalam (see `TDD.md §4` for provider choices and fallbacks).
- Synthetic data plausibly represents one Kudumbashree CDS cluster (skills, geography, group structure).
- Members have entry-level Android smartphones and intermittent connectivity.
- Coordinators exist per cluster and will review team proposals.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Malayalam STT accuracy on dialect/noise | Icon-tap fallback for every voice step; read-back confirmation |
| LLM drifts or invents details | Constrained, template-guarded prompt; narration validated against match record before playback |
| Team-assembly search cost at scale | Scope search per CDS cluster; greedy + bounded exact solver; cache |
| Synthetic data doesn't transfer | Schema-compatible with real Kudumbashree fields; seed generator kept as a fixture, not a dependency |
| Cold trust from coordinators | Always show the rationale; position as extending, not replacing, coordinators |

## 10. Open questions

- Which specific CDS cluster and skill taxonomy to model in seed data?
- Pay/earnings representation: fixed rate, per-piece, or range?
- Consent model for cross-group visibility of a woman's profile (privacy).
- Notification channel for team invites (in-app only, or SMS/WhatsApp bridge)?
