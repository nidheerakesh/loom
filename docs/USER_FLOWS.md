# Loom — User & App Flows

**Version:** 1.0
**Companion docs:** `PRD.md`, `TDD.md`, `UI_UX_DESIGN.md`

This document describes step-by-step how each persona moves through Loom. Every P0 **Provider** flow is completable with **voice + icons only** — no reading English required. Notation: **[Screen]**, *(voice)*, `(tap)`, → transition, ⤳ system action.

---

## 0. Navigation model

Loom is a **two-sided marketplace**. Three top-level surfaces, chosen by role at sign-in:

- **Provider app** (the "skilled" side) — bottom nav: *Current · Requests · Communities · Profile* (all icon + Malayalam label, with audio on long-press). "Find work" (individual match feed) lives under Current.
- **Customer app** (the demand side) — bottom nav: *Browse · Request · Accepted · Profile*. May use text; Malayalam UI available.
- **Admin dashboard** — web, data + monitoring + moderation (not audio-first).

*(The former standalone Coordinator app is removed; its post/assemble/confirm powers live in the Customer app.)*

A persistent **🔊 listen** affordance reads the current screen's key action aloud (Provider surfaces especially).

---

## 1. Provider onboarding (first run)

```
[Welcome] ⤳ auto-plays Malayalam greeting + "tap the mic to begin"
  → (tap) Phone number  ⤳ POST /auth/otp/request
  → [Enter OTP]  (tap digits)  ⤳ POST /auth/otp/verify → session
  → [Language]  (defaults to Malayalam, preselected)
  → [Add your skills]  (see Flow 2)
  → [Set up profile]  (see Flow 2b — name/shop, rate, delivery; skippable, P1 fields)
  → [Home / Current]
```

- No email, no password (TDD §10).
- Numeric OTP entry uses large tappable digits; no text keyboard needed.
- If OTP fails: **[Enter OTP]** shows a clear Malayalam retry line + a `(tap)` "resend", and reads it aloud.

**Empty state after onboarding:** Home says (aloud + on screen) "Add a skill to see work near you," with a single prominent `(tap)` to skills.

---

## 2. Add / edit skills (voice-first, icon fallback)

```
[Add your skills]
  Path A — Voice:
    (tap) 🎤  → *(voice: "എനിക്ക് തയ്ക്കാനും പാചകം ചെയ്യാനും അറിയാം")*
    ⤳ POST /input/transcribe → transcript + extracted skills
    ⤳ skill resolution (TDD §6.0): each phrase → canonical Skill
       (curated alias → else LaBSE cosine ≥ threshold → else review candidate)
    → [Confirm skills]  chips shown as icons + the *canonical* Malayalam names, read aloud
       (tap ✓ keep) / (tap ✗ remove)  → ⤳ POST /providers/me/skills
  Path B — Icons:
    (tap) skill tiles (stitching, cooking, craft, tutoring, packaging…)
    ⤳ GET /skills provides icon_key + names
    → same [Confirm skills] step
  → [Home / Current]
```

**Key rule:** the system **reads back** what it understood before saving — and it reads back the **canonical** skill name it resolved to (e.g. she says "garment sewing," it confirms "തയ്യൽ / stitching"). Voice is never trusted silently. If STT confidence is low, it auto-suggests the icon path.

**Synonym merge (S9):** synonymous inputs collapse to one skill so she is matched to the same demand as everyone with that skill. If a phrase matches nothing above threshold, the confirm step says (aloud) "new skill — we'll review it," records a `skill_candidate`, and still lets her keep it pending review. Deterministic; no runtime LLM.

---

## 2b. Provider profile setup (voice + icon, mostly P1)

```
[Set up profile]
  • Name / Shop name        (voice or type)
  • No. of ppl (capacity)   (tap number; 1 = solo, >1 = shop)
  • Rate + delivery time     (tap number pad; rate range optional)
  • Languages                (default Malayalam preselected)
  • Upload work (portfolio)  (tap 📷 → pick images + spoken caption) ⤳ POST /providers/me/portfolio
  ⤳ PATCH /providers/me
  → [Home / Current]
```

- Every field is skippable; skills (Flow 2) are the only hard requirement to get matched.
- Numbers (capacity, rate, delivery) use tappable pads + numerals — readable across literacy.
- Rating is not set here; it accrues from Customer reviews (Flow 9.4).

---

## 3. Individual match discovery (core Provider flow)

```
[Current → Find work]
  ⤳ GET /matches/individual  → ranked cards (skill fit · distance · pay)
  Each [Match card]: title icon · distance · pay · ▶ play
  → (tap ▶)  ⤳ GET /matches/{id}/narration
     → [Match detail]
         • plays Malayalam explanation (TTS)
         • animates graph path: You → your skill → this request (Cytoscape)
         • shows distance + pay as icons/numerals
     → (tap ✋ "I'm interested")  ⤳ POST /matches/{id}/interest
        → confirmation read aloud: "The customer will see your interest."
```

- Cards are large, image/icon-led; the ▶ button is the primary action.
- Distance and pay use numerals + icons (universally readable), never English sentences.
- **No results:** screen invites action — "No work nearby yet. Add another skill to widen your matches." with a `(tap)` to Flow 2.

---

## 4. Customer onboarding + browse + filter + request

### 4a. Customer onboarding
```
[Welcome] → (tap) Phone number ⤳ POST /auth/otp/request
  → [Enter OTP] ⤳ /auth/otp/verify → session
  → [Profile] name / company · location   ⤳ PATCH /customers/me
  → [Home / Browse]
```

### 4b. Browse providers with filters (C5/C6)
```
[Browse]
  (tap) skill  → ⤳ GET /providers?skill=…
  [Filters]  (deterministic hard constraints — TDD §6.4)
    • distance   (slider: within N km)
    • experience (tiers: any / 1+ / 3+ / 5+ yrs)
    • price/rate (range)
  ⤳ GET /providers?skill=&max_distance_km=&min_experience=&max_rate=
  → ranked [Provider cards]: name/shop · rating · rate + delivery · distance · skills
  → (tap) [Provider profile] ⤳ GET /providers/{id}
       • skills, rate + delivery, portfolio grid, rating/reviews, capacity
       • (tap 💬 Chat) → Flow 9.5   (tap ✋ Request) → Flow 4c prefilled
```

### 4c. Post a request (C1 — replaces "post opportunity")
```
[Request] → [New request]
  Form or voice:
    • description / what is needed
    • required skills (icon multi-select, meaning-matched + canonicalised)
    • no. of ppl
    • ◉ individual  /  ○ group      ← mode toggle
    • units  (e.g. 200)
    • location · pay · deadline
  ⤳ POST /requests
  ⤳ Team detection: mode = group, OR units exceed a provider's capacity →
     banner: "This looks like a team order. Assemble a team?"  (tap) → Flow 5
  (individual mode → routed to a single provider; provider sees it in Flow 4d)
```

### 4d. Provider receives a direct request (M11)
```
[Requests] (Provider) ⤳ GET /providers/me/requests → incoming cards
  → [Request]  auto-plays Malayalam: what/where/pay
  → (tap ✓ Accept) ⤳ POST /requests/{id}/respond (accept) → moves to [Current]
  → (tap ✗ Decline) ⤳ respond (decline)
```

- Customers can enter request details by voice too; same transcribe → confirm pattern.
- Accept/decline is one tap and read aloud (voice+icon, no English needed).

---

## 5. Team assembly (the signature flow)

```
Trigger: group request / large order (auto-detected) or (tap) "Assemble team" on a request.
  ⤳ POST /requests/{id}/assemble
     → match engine runs constrained set-cover over the cluster subgraph
       (respecting each provider's capacity — a shop can cover multiple units)
     → [Proposed team]
         • the specific providers, their group, and the skill + units each covers
         • coverage proof: required vs covered (complete ✓)
         • animated path: request ⇠ requires-skill ⇠ providers ⇠ groups
         • deterministic rationale shown ("why these providers")
  Customer:
    (tap ✓ Confirm)  ⤳ POST /teams/{id}/confirm
      → ⤳ invites sent to each provider (Flow 6)
    (tap ⤿ Swap member)  → pick alternate → ⤳ re-check feasibility → re-render
```

**Demo moment (PRD G2):** a woman's spoken skills, a Customer's distant bulk (group) request, and a five-woman team assembled live across two groups — the path animates and is explained aloud in Malayalam.

The proposed team is `status = proposed` until confirmed; nothing is committed silently.

---

## 6. Provider receives & responds to a team invite

```
[Current → Teams]  ⤳ shows pending invite with a badge
  → [Invite]  auto-plays Malayalam: what the order is, who is on the team, your part
     • shows the team as icons + your assigned skill highlighted
  → (tap ✓ Join)  ⤳ POST /teams/{id}/members/{mid}/respond (accept)
     → "You're on the team." (aloud)
  → (tap ✗ Can't)  ⤳ respond (decline)
     → ⤳ customer notified; team may re-assemble (Flow 5 swap)
```

- The invite always explains **why** she was chosen (her skill's role), building trust.
- Accepting/declining is one tap; the consequence is read aloud.

---

## 7. Current work (Provider)

```
[Current]
  • Interested — requests you raised your hand for (status)
  • Accepted / Teams — direct requests + teams you've joined (order, your part, teammates)
  • Find work — the individual match feed (Flow 3)
  (tap any) → detail with ▶ narration replay
```

Read-only status tracking in v1 (no payments/completion tracking yet — future scope).

---

## 8. Customer inbox, accepted requests & cluster view

```
[Accepted] → GET /customers/me/requests?status=accepted  → providers who accepted
[Request → interests] → GET /customers/requests/{id}/interests  → who expressed interest
[Profile → History] → GET /customers/me/history  → "people you've worked with"
[Cluster] (P1) → cross-group skill capacity map for the CDS cluster
```

---

## 9. Cross-cutting flows

### 9.1 Listen-to-anything
Long-press any label or `(tap 🔊)` → that element is spoken in Malayalam. Applies app-wide.

### 9.2 Offline (P1)
If offline: last **[Find work]** feed and the UI shell load from cache with an "offline" indicator; voice/matching actions are disabled with a spoken explanation and retry.

### 9.3 Error & retry (voice-first)
Every error is spoken and shown in the interface's own Malayalam voice, states what happened, and offers one clear next action (retry / use icons / call for help). Errors never apologise or use jargon (see `UI_UX_DESIGN.md` copy rules).

### 9.4 Rating a Provider (Customer)
After a request completes, the Customer may rate: `[Rate] ★★★★★ + comment` ⤳ POST /providers/{id}/ratings. The aggregate shows on the Provider profile. Display-first — not part of the match decision (TDD §6.4).

### 9.5 Community chat (M10, P1)
```
Entry: (tap 💬) from a Provider profile, a request, or a team → or the Provider "Communities" tab.
  ⤳ GET/POST /chat/threads → [Thread]
     • incoming messages: (tap 🔊) reads aloud in Malayalam (TTS)
     • send: (tap 🎤) voice-to-text  or type  ⤳ POST /chat/threads/{id}/messages
```
Used to discuss price/rates. **Informational only — no payments in-app** (PRD §2.3). Chat never influences a match (TDD §1). Opt-in + moderated (TDD §10).

### 9.6 Grievance portal (M16, P1)
```
[Profile → Grievance] (separate page)
  • subject + body (voice or type)  ⤳ POST /grievances
  • [My grievances] status list      ⤳ GET /grievances/me
```
Admin reviews and acts (TDD §10).

---

## 10. End-to-end demo script (happy path)

1. Provider signs in with phone-OTP, speaks "I can stitch and cook," confirms skills by voice — synonyms collapse to canonical skills. *(Flows 1–2)*
2. Customer browses tailors, filters to within 5 km / 3+ yrs / under ₹500, opens a portfolio. *(Flow 4b)*
3. Customer posts a 200-piece uniform request as **group**; Loom flags it as a team order. *(Flow 4c)*
4. Customer taps assemble → Loom proposes a five-woman team across two groups (respecting capacity), shows coverage + animated path + Malayalam rationale, and confirms. *(Flow 5)*
5. Each Provider gets a spoken invite explaining her part; the first Provider taps Join. *(Flow 6)*
6. Separately, the same Provider opens Find work and hears an individual match explained in Malayalam with its path animated. *(Flow 3)*

This exercises every P0 flow and both matching modes, with the Provider side entirely in Malayalam voice + icons.
