# Loom — Product Requirements Document (PRD)

**Product:** Loom — AI Matching Engine for Women's Livelihood Networks
**Owner:** Nidhi Rakesh · Team: Niveditha G. S., Anjana Nandakumar
**Version:** 1.0 (production-ready foundation)
**Status:** Draft for build
**Last updated:** June 2026

---

## 1. Overview

Loom is an intelligence layer over women's self-help group (SHG) networks — starting with Kerala's Kudumbashree — that routes income through a graph of women, skills, groups, and live demand. It is a **two-sided marketplace**: **Providers** (a skilled woman, or a small shop of several women) offer skills, and **Customers** browse, filter, and request work directly. On top of ordinary listing, Loom does two things no job board does: it surfaces nearby work an individual can do alone, and it **assembles cross-group teams** for orders too large for any one Provider. Every match is narrated in spoken Malayalam by a grounded GenAI layer that *narrates* the graph's decision — it never makes it.

The Provider side stays voice-and-icon first for low-literacy users; the Customer side may use text. Team assembly remains the headline capability — the marketplace surfaces around it are additive, never a replacement.

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
| G5 | Plug into Kudumbashree, don't replace it | A Customer (incl. a cluster coordinator) can post, review, and confirm within their cluster |

### 2.3 Non-goals (v1)

- Payments, escrow, or invoicing. (Rates are *displayed and discussed*, never *transacted* in-app.)
- Training/GNN models on outcome data (future — needs outcome history).
- Languages beyond Malayalam (architecture is language-agnostic; only Malayalam ships in v1).
- Native iOS/Android apps.

> Note: in-app chat/messaging was previously a non-goal. It is now **in scope as P1** — a "Communities" chat where Providers and Customers discuss price/rates (see M10, §4.1). Rate discussion is informational only; the payments non-goal above still holds.

---

## 3. Users & personas

| Persona | Who | Primary needs | Access mode |
| --- | --- | --- | --- |
| **Provider** (primary) | An SHG woman *or* a small shop of a few women (`capacity ≥ 1`), often first-generation smartphone users, low English literacy | Build a profile (skills, rate, portfolio, delivery), receive & accept/decline requests, find work, join teams, understand *why* a match fits, chat about rates | Voice + icons + Malayalam audio |
| **Customer** | Panchayat, enterprise, SHG federation, or an individual with an order — also fills the cluster-coordinator role | Browse & filter Providers (distance/experience/price), post requests (individual or group), review & confirm assembled teams, see who they've worked with, chat about rates | Text + voice, Malayalam UI |
| **Admin** | Program/NGO operator | Manage clusters, seed data, moderate grievances/chat, monitor health, audit matches | Web dashboard |

**Note on the Coordinator:** the earlier "CDS Coordinator" persona is **absorbed into Customer** — a Customer now posts requests and confirms teams directly. Where a request spans SHG groups, cluster governance/consent still applies (see open questions §10).

**Primary design target:** the Provider. If a flow can't be completed by a low-literacy woman using voice and icons alone, it isn't done. Customer surfaces may use text.

---

## 4. Feature requirements

Priority: **P0** = must ship in v1, **P1** = ship if time, **P2** = future.

### 4.1 Provider features (the "skilled" side)

| ID | Feature | Priority | Requirement |
| --- | --- | --- | --- |
| M1 | Phone-OTP onboarding | P0 | Sign in with phone number + OTP; no email, no password. Language defaults to Malayalam. |
| M2 | Voice skill entry | P0 | Speak skills in Malayalam; STT → structured skill nodes. Confirmation read back aloud. Synonymous inputs collapse to one canonical skill (see S9). |
| M3 | Icon skill entry | P0 | Tap illustrated skill tiles (stitching, cooking, craft, tutoring, packaging…) as a voice alternative/supplement. |
| M4 | Individual match feed | P0 | Ranked nearby requests by skill fit, distance, earnings. Each card has a play button for Malayalam narration. |
| M5 | Match explanation | P0 | Tap a match → hear plain Malayalam explanation + see animated graph path from her to the request. |
| M6 | Express interest | P0 | One-tap "I'm interested" on a match; notifies the Customer, records intent. |
| M7 | Team invitations | P0 | Receive and accept/decline invitations to join an assembled team; hear what the team is for and who's in it. |
| M8 | Availability toggle | P1 | Mark available/busy so matching respects capacity. |
| M9 | My work ("Current") | P1 | List of accepted requests and teams joined, with status. |
| M10 | Community chat | P1 | "Communities" tab: threaded chat with Customers/Providers to discuss price/rates. Rate discussion is informational, not transactional. Voice+icon accessible (mic-to-send, 🔊 read-aloud). |
| M11 | Incoming requests | P0 | Receive direct Customer requests; one-tap accept ✓ / decline ✗, read aloud in Malayalam. |
| M12 | Provider profile | P0 | Profile with name / **shop name**, `capacity` (no. of ppl; 1 = solo), phone, location, skills, languages (default Malayalam). Voice+icon editable. |
| M13 | Rate + delivery | P1 | Set a rate (or range) and typical delivery time; shown on the Provider card and used by Customer price filters. |
| M14 | Portfolio ("Upload work") | P1 | Upload images of past work with captions; shown on the profile. Signed-URL storage. |
| M15 | Rating / reputation | P1 | Display a 0–5 rating aggregated from Customer reviews. Display-first; not part of the match decision unless explicitly configured (see §10). |
| M16 | Grievance portal | P1 | A separate page to submit a grievance and track its status. |

### 4.2 Customer features (the demand side)

| ID | Feature | Priority | Requirement |
| --- | --- | --- | --- |
| C0 | Customer onboarding | P0 | Sign in with phone + OTP (phone verification); profile with name / company, location. |
| C1 | Post request | P0 | Create a request: description, required skills, no. of ppl, **group/individual toggle**, units, location, deadline, pay. Voice or form entry. (Replaces the old "post opportunity".) |
| C2 | Large-order / team detection | P0 | System flags requests marked `group`, or whose units exceed a Provider's `capacity`, and offers team assembly. |
| C3 | Review assembled team | P0 | See the proposed team (which Providers, which groups, coverage, proximity) with the deterministic rationale before confirming. |
| C4 | Confirm/adjust team | P0 | Confirm the team or swap a member; system re-checks feasibility. |
| C5 | Browse providers | P0 | Directory search of Providers by skill. |
| C6 | Provider filters | P0 | Filter the directory by **distance**, **experience**, and **price/rate** (hard constraints; deterministic). |
| C7 | Provider profile view | P0 | View a Provider's profile: skills, rate + delivery, portfolio, rating, shop/capacity. |
| C8 | Interested / accepted inbox | P0 | See who expressed interest / accepted per request ("Accepted requests"). |
| C9 | Work history | P1 | "People you've worked with" — past Providers and requests. |
| C10 | Community chat | P1 | Chat with Providers to discuss price/rates (shared with M10). |
| C11 | Cluster capacity view | P1 | Cross-group view of skills available in the cluster. |

### 4.3 System / platform features

| ID | Feature | Priority | Requirement |
| --- | --- | --- | --- |
| S1 | Graph store | P0 | Heterogeneous graph of women, skills, groups, CDS clusters, opportunities, locations with typed edges. |
| S2 | Semantic skill matching | P0 | *Match-time* matching by meaning, not keywords ("stitching" ↔ "garment finishing"), via multilingual embeddings. |
| S3 | Team-assembly engine | P0 | Constrained set-cover over required skills with proximity + availability; returns the specific team. |
| S4 | Grounded narration | P0 | LLM converts a deterministic match record into Malayalam text; TTS speaks it. LLM output is constrained and cannot change the match. |
| S5 | Match audit log | P0 | Every match stores its inputs, scores, and chosen path; narration references only this record. |
| S6 | Synthetic data seeding | P0 | Reproducible generator for members, skills, groups, opportunities across a demo CDS cluster. |
| S7 | Animated graph view | P0 | Cytoscape.js view that traverses and highlights the winning path. |
| S8 | Offline tolerance | P1 | PWA caches last feed and UI shell; voice/matching require network. |
| S9 | Skill canonicalization | P0 | *Entry-time* dedup: synonymous skill inputs collapse to one canonical `Skill` node via a curated alias table + LaBSE cosine threshold. Deterministic; no runtime LLM. Below-threshold inputs become admin-review candidates. |
| S10 | Provider directory search | P0 | Filter-then-rank search over Providers by skill with distance/experience/price hard constraints (deterministic). |
| S11 | Community chat store | P1 | Threaded messages scoped to a context (provider / request / team); outside the match path. |
| S12 | Reputation | P1 | Aggregate Customer ratings on a Provider; display-first, not in the match decision by default. |

---

## 5. Key user stories

- *As a Provider,* I speak "I can stitch and cook" and hear back three nearby jobs, so I can find paid work without reading English.
- *As a Provider,* I get invited to a five-woman team for a uniform order, hear who's on it and what my part is, and accept in one tap.
- *As a Provider,* I set my rate and upload photos of past work, so Customers can find and trust me.
- *As a Customer,* I browse tailors within 5 km, filter to those with 3+ years' experience under ₹500/piece, and view their portfolios before requesting.
- *As a Customer,* I post a 200-piece uniform order as a "group" request and Loom proposes a team across two groups that together cover cutting, stitching, and finishing within 3 km.
- *As a Customer,* I see *why* each woman is on the team before I confirm, so I trust the suggestion.
- *As an Admin,* I can trace any narration back to the exact graph decision that produced it.

---

## 6. Core differentiator (protect this)

Loom's defensible edge is **collective opportunity matching** — a class of problem single-listing job boards cannot represent and human coordinators cannot scale. The marketplace layer (browse, filter, profiles, chat) makes Loom usable day-to-day, but it must never eclipse the collective edge. Every product decision must preserve three properties:

1. **Collective-first.** Team assembly is a headline capability, not an add-on. The Customer browse/request/filter surfaces are additive; they do not replace it.
2. **Deterministic + explainable.** The graph decides; the LLM narrates. Never blur this. Marketplace additions (ratings, chat, filters) stay out of the match *decision* — filters are deterministic hard constraints, and ratings are display-first.
3. **Malayalam-first, low-literacy-first.** For Providers, voice and icons are the primary interface, not an accessibility afterthought.

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
- Customers (including cluster coordinators) will review and confirm team proposals.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Malayalam STT accuracy on dialect/noise | Icon-tap fallback for every voice step; read-back confirmation |
| LLM drifts or invents details | Constrained, template-guarded prompt; narration validated against match record before playback |
| Team-assembly search cost at scale | Scope search per CDS cluster; greedy + bounded exact solver; cache |
| Synthetic data doesn't transfer | Schema-compatible with real Kudumbashree fields; seed generator kept as a fixture, not a dependency |
| Cold trust from Customers/coordinators | Always show the rationale; position as extending, not replacing, existing coordination |

## 10. Open questions

- Which specific CDS cluster and skill taxonomy to model in seed data?
- Pay/earnings and **Provider rate** representation: fixed rate, per-piece, per-skill, or range?
- Consent model for cross-group visibility of a woman's profile (privacy) — does Customer *browse* respect the same consent flag as matching?
- Notification channel for team invites (in-app only, or SMS/WhatsApp bridge)?
- **Experience** representation: self-reported years, proficiency-derived, or verified?
- **Rating**: display-only, or a deterministic term in the ranking score?
- **Grievance portal** scope: simple submit + status, or full case management?
- With the Coordinator absorbed into Customer, does a cross-group ("group") request still need Kudumbashree cluster approval/consent before a team is confirmed?
- Chat moderation and Provider↔Customer messaging consent.
