# Loom
## The AI Matching Engine for Women's Livelihood Networks
*Turning skills into income no one could reach alone*

**BharatNext: Building for Tier-2 and Tier-3 India**
Indian Institute of Information Technology (IIIT) Kottayam

| | |
|---|---|
| **Project Title** | Loom — AI Matching Engine for Women's Livelihood Networks |
| **Team Members** | Nidhi Rakesh; Niveditha G. S.; Anjana Nandakumar |
| **Institution** | Indian Institute of Information Technology (IIIT) Kottayam |
| **Hackathon** | Girlathon — GDG On Campus, Mar Athanasius College of Engineering |
| **Track** | BharatNext: Building for Tier-2 and Tier-3 India |
| **Live** | https://loom-lovat-phi.vercel.app |
| **Repository** | https://github.com/nidheerakesh/loom |

> **Note on this document.** It describes the system **as built and deployed**, not as
> originally specified. `docs/PRD.md` and `docs/TDD.md` remain the design specs and describe a
> more ambitious architecture (Neo4j, node2vec embeddings, FastAPI, speech-to-text). Where the
> build diverges, this document follows the build. §11 lists what is specified but not yet
> implemented.

---

## 1 Executive Summary

India hosts the world's largest network of women's self-help groups — more than 8.5 million
groups nationally, and roughly 4.5 million women in Kerala's Kudumbashree network alone.
Microcredit and community organisation have reached these women at scale; market access has
not. Many members can produce goods and services but lack visibility into nearby demand,
reliable channels for paid work, and the bargaining power to capture fair value. The largest
income opportunities are often invisible because no single woman can fulfil them alone.

Loom addresses this market-access gap by modelling a local livelihood economy as a network of
women, skills, self-help groups, and live income opportunities. Over that model it performs
two forms of matching: it connects an individual woman to nearby work she can complete
independently, and it detects opportunities too large for any one person and assembles a
capable team across groups.

Each match is explained in plain Malayalam, and can be read aloud. The explanation is
generated from the logged match record by a deterministic template — the matching engine
decides, and the explanation layer only reports. Positioned as a computational layer above the
existing Kudumbashree ecosystem, Loom turns scattered skills and invisible demand into
coordinated income.

**Core innovation:** Loom finds and assembles income opportunities that exist only
collectively, a capability that single-listing job boards cannot represent and human
coordinators cannot scale.

---

## 2 Problem Statement

The constraint on rural women's economic participation is no longer only credit or
organisation; those have been addressed at unprecedented scale. The binding constraint today
is the market: connecting local capability to paid demand.

| 8.5M+ | ~4.5M | 13.9% | 3 Crore |
|---|---|---|---|
| women's self-help groups | women in Kerala's Kudumbashree network | women with ICT skills, vs 22.8% of men | Lakhpati Didi target focused on income growth |

**Two structural failures**

- **Invisible demand.** A woman skilled in stitching, cooking, craft, tutoring or packaging
  often cannot see paid demand a few kilometres away. Work is found by word of mouth, so many
  opportunities never reach her.
- **Unreachable collective income.** A 200-piece uniform contract or a large catering order can
  materially change earnings, but requires a coordinated team. No conventional platform
  assembles that team from scattered local capacity.

Conventional job platforms are built for urban, formal, individual hiring: one person, one
listing. Rural women's livelihood potential is collective, hyper-local and relationship-bound.
Real demand goes unmet not because skill is absent, but because nothing connects distributed
skills to opportunities that require them in combination.

---

## 3 Proposed Solution

Loom models a local economy as a connected set of women, skills, groups and opportunities, and
routes income through it — including income reachable only when women collaborate.

| Mode | How it works |
|---|---|
| **Individual matching** | Ranks open work for a provider by skill proficiency, distance and pay, using a deterministic weighted score. Skill vocabulary is canonicalised on entry, so a woman who types "tailoring", "garment finishing" or "thayyal" is matched against work posted as *stitching*. |
| **Group matching** | Detects orders exceeding any individual's capacity and runs a capacity-aware covering search across groups, composing a team optimised for skill coverage, proximity and availability, and reporting whether coverage is complete. |

Every result is explained in plain Malayalam and can be spoken aloud. The explanation is not a
free-form chatbot: it is rendered from the match record after the decision is made, so it
cannot contradict it.

**What makes it unique:** a job board says *"You are a tailor; here are tailoring jobs."* Loom
says *"You, four nearby women, and one bulk order three kilometres away add up — here is the
team that reaches income none of you could alone."*

**Relationship to Kudumbashree.** Kudumbashree already organises women, provides credit and
supports livelihoods, with matching often mediated by coordinators who know their own cluster.
Loom extends this rather than replacing it, providing computation for cross-cluster collective
matching and giving coordinators visibility beyond their immediate network.

---

## 4 Objectives

**Primary objective.** Surface and assemble income opportunities for women in Tier-2 and Tier-3
communities, including collective opportunities individuals and conventional platforms cannot
see.

**Secondary objectives**

- Support low-literacy and non-English users through a Malayalam-first interface with spoken
  output.
- Keep decision logic deterministic and explainable, with the explanation layer strictly
  downstream of the decision.
- Design the platform as a layer that plugs into Kudumbashree and other self-help group
  ecosystems rather than competing with them.

**Expected outcomes**

- A working deployment that takes typed skills and returns both individual and collective
  matches with Malayalam explanations.
- A demonstrable collective match in which a multi-woman team is assembled for an order no
  individual could fulfil alone.
- A clear pilot path within one Kudumbashree community-development-society cluster.

---

## 5 System Architecture

```
Browser (React + Vite, Malayalam-first)
        │  same-origin /api/*
        ▼
api/router.ts              one serverless function, path → handler map
        ▼
api/_routes/**             36 handlers across 11 feature areas
        ▼
api/_lib/**                matching, scoring, geo, skill canonicalisation,
                           chat authorisation, translation chain
        ▼
Supabase Postgres          24 tables, RLS enabled on every one
```

**Components**

- **Skill entry and canonicalisation.** Typed free text is resolved to a canonical skill by
  exact match, then a curated alias table, then a conservative typo check. Unrecognised
  phrases are translated (Bhashini → NVIDIA → Anthropic → Gemini, with an offline fallback)
  and become new skills.
- **Data model.** A relational representation of the livelihood network: `providers`,
  `skills`, `groups`, `cds`, `requests`, with `provider_skills`, `request_skills`,
  `near_distances` and `team_members` as the typed relationships between them.
- **Match engine.** Deterministic scoring for individual matches; a greedy capacity-aware
  covering search for team assembly.
- **Explanation layer.** A Malayalam template rendered from the stored match record, spoken
  through the browser's speech engine.
- **Front-end.** React with a Malayalam-first interface, self-hosted Malayalam typography, and
  a 56px minimum touch target throughout.

**Data flow.** Typed skills become canonical skill records. The engine queries for one-to-one
matches and scans for collective opportunities. The selected match and its justification are
written to an audit table, then rendered. Match correctness is fixed in the deterministic layer
before any text is produced.

---

## 6 Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Data store | Supabase (PostgreSQL) | Relational model of the livelihood network; row level security on all 24 tables |
| Backend | TypeScript on Vercel Serverless Functions | One function serving 36 routes, same-origin with the front-end |
| Matching logic | TypeScript, deterministic scoring + greedy covering search | Explainable, reproducible team composition |
| Validation | Zod | Request schema at every route boundary |
| Front-end | React 18 + Vite + Tailwind | Malayalam-first responsive interface |
| Server state | TanStack Query | Caching and polling |
| Voice output | Web Speech API (`ml-IN` / `en-IN`) | Spoken Malayalam explanations, no API key required |
| Translation | Bhashini NMT, with LLM fallbacks | Naming genuinely new skills at entry time |
| Auth | Phone + OTP, Twilio Verify optional | HMAC-signed tickets; no passwords |
| Deployment | Vercel (Mumbai region) + Supabase | Managed, continuously deployed from `main` |

**Primary language and runtime:** TypeScript throughout — one codebase serves both the
matching layer and the interface. This diverges from `docs/TDD.md`, which specifies Python and
FastAPI; the single-language deployment was chosen for a same-origin API and a simpler
operational footprint.

---

## 7 Key Features

| Feature | Description |
|---|---|
| **Collective matching** | Assembles a team across groups for orders no individual can complete alone, capacity-aware and distance-aware. |
| **Deterministic, reproducible matching** | The same data always produces the same team, down to explicit tiebreak columns — because Postgres UUIDs are random and ties must not reorder between runs. |
| **Canonical skill vocabulary** | "tailoring", "garment finishing", "thayyal" and "തയ്യൽ" all resolve to one skill, so the marketplace does not fragment into unsearchable synonyms. |
| **Malayalam-first interface** | Defaults to Malayalam and remembers the choice; self-hosted Malayalam typography; spoken output where a device voice exists. |
| **Grounded explanations** | The explanation is rendered from the logged match record after the decision, so it cannot contradict the engine. |
| **Customer control** | The customer chooses between providers who apply, can swap any team member before confirming, and can edit or close their own request. |
| **Private conversations** | Chat is restricted to participants, derived from the thread's context rather than a shared board. |

---

## 8 Innovation and Competitive Advantage

Loom's differentiator is structural: it represents and solves collective opportunity matching,
a class of problem most competing approaches cannot express.

| Approach | Individual Match | Team Assembly | Local-Language Grounding |
|---|---|---|---|
| Job boards | Yes | No | Limited |
| Generic AI chatbot | Partial | No | High hallucination risk |
| Kudumbashree manual coordination | Within cluster | Slow and relationship-bound | Strong human trust |
| **Loom** | **Yes, deterministic** | **Yes, core capability** | **Yes, grounded** |

**Defensible moat.** Loom combines a modelled livelihood network, constrained team-assembly
search, and deployment over an existing women-centred network rather than a cold-start
marketplace. Because the matching layer is deterministic rather than learned, every result is
reproducible and auditable — a requirement for a system that intermediates people's income.

---

## 9 Expected Impact

**Social.** Loom centres women's economic agency through the self-help group ecosystem itself.
A Malayalam-first interface with spoken explanations reaches users excluded by text-heavy,
English-first platforms.

**Economic.** The platform raises the earning ceiling, not merely access. By making invisible
demand visible and unlocking collective contracts, it captures income currently lost to
coordination failure, and supports missions such as Lakhpati Didi by addressing the
market-access bottleneck behind sustained income growth.

**Environmental and systemic.** Because matching is proximity-weighted, Loom favours
hyper-local fulfilment, reducing transport overhead and keeping value within the community.

---

## 10 Feasibility and Scalability

**Technical feasibility.** Every component is deployed and running today on managed services.
The matching algorithms are lightweight, explainable, and require no model training or
inference infrastructure.

**Cost.** The system runs at near-zero cost on free-tier hosting. There is no per-match model
cost: translation is used only when a genuinely new skill is named, and speech synthesis runs
on the device.

**Performance.** The matching path was measured and optimised: the provider directory went
from 21.0s to 1.4s in production by replacing per-row query loops with batched queries and
co-locating the serverless function with its users.

**Scalability.** The relational model migrates to a dedicated graph store if traversal depth
grows beyond the current fixed-depth joins. Matching parallelises by cluster, and the
architecture is network-agnostic, extending to other federations and languages.

**Pilot strategy.** Start with one Kudumbashree community-development-society cluster, prove
cross-group matching, then expand tier by tier.

---

## 11 Current Limitations and Future Scope

Stated plainly, because they bound what the current deployment demonstrates.

**Not yet implemented**

- **Speech-to-text.** Skill entry is typed. Spoken *output* works; spoken *input* does not, so
  the voice-first goal for low-literacy users is only half met.
- **Learned embeddings.** Skill matching uses a curated alias table (~110 phrases across six
  skills in English, Malayalam and Manglish), not vector similarity. It is deterministic and
  explainable, but does not generalise to phrases nobody has listed.
- **Graph visualisation.** The justification for a match is shown as text, not as an animated
  traversal.
- **Admin dashboard.** Grievances are collected but there is no moderation surface.
- **Real location.** A provider's location is currently assigned deterministically rather than
  captured, so distances are computed correctly over placeholder coordinates.

**Future scope**

- Capture real locations, then speech-to-text, then a graph view of the justification.
- Ingest live opportunities from panchayat, federation and local enterprise feeds.
- Train graph neural networks once match-outcome data exists, including whether assembled
  teams completed orders successfully.
- Add reputation, reliability and fair-rotation signals so opportunities spread equitably.
- Replicate across self-help group federations in other Indian states and languages.

---

## 12 Conclusion

India has built the world's largest network of women's self-help groups and expanded access to
credit. What remains missing is the intelligence to route income through that network: to
connect a woman's skill to demand she cannot see, and to assemble collective opportunities no
individual can reach alone.

Loom is that layer. By modelling the livelihood economy and matching over it both individually
and collectively, it turns scattered skills and invisible demand into real, shared income — in
the language users speak, on top of a network that already exists. It is not a job board, not a
chatbot, and not a tutorial. It is a grounded, defensible answer to the market-access gap that
holds millions of women back.

**Loom does not just help women find work; it finds the work that was invisible and the income
that was unreachable alone.**

---

## Project Snapshot

| The Problem | The Solution |
|---|---|
| Millions of self-help group women have credit and skills but limited visibility into nearby demand. The largest team-sized income opportunities remain invisible because no single woman can fulfil them alone. Market access, not money, is the gap. | Model the livelihood economy as a connected network; match women to individual work and assemble cross-group teams for orders no one can complete alone, explained in Malayalam. |

| Why It Wins | Technology at a Glance |
|---|---|
| Collective matching that job boards cannot represent; deterministic and auditable rather than a black box; extension of the Kudumbashree network; Malayalam-first design. | TypeScript on Vercel; Supabase Postgres; deterministic scoring and greedy covering search; React + Vite; Web Speech Malayalam output; Bhashini translation. |

| Demo Moment | Impact in One Line |
|---|---|
| A customer posts a 30-unit multi-skill order and taps Assemble. A team is composed across several self-help groups with a stated coverage rationale; the customer swaps one member and confirms. The invitation appears for each provider, who hears her match explained in Malayalam. | Loom finds the work that was invisible and the income that was unreachable alone, for the women who need it most. |
