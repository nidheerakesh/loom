# Loom — User & App Flows

**Version:** 1.0
**Companion docs:** `PRD.md`, `TDD.md`, `UI_UX_DESIGN.md`

This document describes step-by-step how each persona moves through Loom. Every P0 member flow is completable with **voice + icons only** — no reading English required. Notation: **[Screen]**, *(voice)*, `(tap)`, → transition, ⤳ system action.

---

## 0. Navigation model

Three top-level surfaces, chosen by role at sign-in:

- **Member app** — bottom nav: *Find work · Teams · My work · Profile* (all icon + Malayalam label, with audio on long-press).
- **Coordinator app** — *Opportunities · Teams · Cluster · Inbox*.
- **Admin dashboard** — web, data + monitoring (not audio-first).

A persistent **🔊 listen** affordance reads the current screen's key action aloud.

---

## 1. Member onboarding (first run)

```
[Welcome] ⤳ auto-plays Malayalam greeting + "tap the mic to begin"
  → (tap) Phone number  ⤳ POST /auth/otp/request
  → [Enter OTP]  (tap digits)  ⤳ POST /auth/otp/verify → session
  → [Language]  (defaults to Malayalam, preselected)
  → [Add your skills]  (see Flow 2)
  → [Home / Find work]
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
    → [Confirm skills]  chips shown as icons + Malayalam names, read aloud
       (tap ✓ keep) / (tap ✗ remove)  → ⤳ POST /members/me/skills
  Path B — Icons:
    (tap) skill tiles (stitching, cooking, craft, tutoring, packaging…)
    ⤳ GET /skills provides icon_key + names
    → same [Confirm skills] step
  → [Find work]
```

**Key rule:** the system **reads back** what it understood before saving. Voice is never trusted silently. If STT confidence is low, it auto-suggests the icon path.

---

## 3. Individual match discovery (core member flow)

```
[Find work]
  ⤳ GET /matches/individual  → ranked cards (skill fit · distance · pay)
  Each [Match card]: title icon · distance · pay · ▶ play
  → (tap ▶)  ⤳ GET /matches/{id}/narration
     → [Match detail]
         • plays Malayalam explanation (TTS)
         • animates graph path: You → your skill → this order (Cytoscape)
         • shows distance + pay as icons/numerals
     → (tap ✋ "I'm interested")  ⤳ POST /matches/{id}/interest
        → confirmation read aloud: "The coordinator will see your interest."
```

- Cards are large, image/icon-led; the ▶ button is the primary action.
- Distance and pay use numerals + icons (universally readable), never English sentences.
- **No results:** screen invites action — "No work nearby yet. Add another skill to widen your matches." with a `(tap)` to Flow 2.

---

## 4. Coordinator posts an opportunity

```
[Opportunities] → (tap +) [New opportunity]
  Form or voice:
    • title / what is needed
    • required skills (icon multi-select, meaning-matched)
    • size / quantity  (e.g. 200)
    • location  (map pin or saved place)
    • pay
    • deadline
  ⤳ POST /opportunities
  ⤳ Large-order detection: if size exceeds any individual's capacity →
     banner: "This looks like a team order. Assemble a team?"  (tap) → Flow 5
```

- Coordinators can enter details by voice too; same transcribe → confirm pattern.

---

## 5. Team assembly (the signature flow)

```
Trigger: large order (auto-detected) or (tap) "Assemble team" on an opportunity.
  ⤳ POST /opportunities/{id}/assemble
     → match engine runs constrained set-cover over the cluster subgraph
     → [Proposed team]
         • the specific women, their group, and the skill each covers
         • coverage proof: required vs covered (complete ✓)
         • animated path: order ⇠ requires-skill ⇠ women ⇠ groups
         • deterministic rationale shown ("why these women")
  Coordinator:
    (tap ✓ Confirm)  ⤳ POST /teams/{id}/confirm
      → ⤳ invites sent to each member (Flow 6)
    (tap ⤿ Swap member)  → pick alternate → ⤳ re-check feasibility → re-render
```

**Demo moment (PRD G2):** a woman's spoken skills, a distant bulk order, and a five-woman team assembled live across two groups — the path animates and is explained aloud in Malayalam.

The proposed team is `status = proposed` until confirmed; nothing is committed silently.

---

## 6. Member receives & responds to a team invite

```
[Teams]  ⤳ shows pending invite with a badge
  → [Invite]  auto-plays Malayalam: what the order is, who is on the team, your part
     • shows the team as icons + your assigned skill highlighted
  → (tap ✓ Join)  ⤳ POST /teams/{id}/members/{mid}/respond (accept)
     → "You're on the team." (aloud)
  → (tap ✗ Can't)  ⤳ respond (decline)
     → ⤳ coordinator notified; team may re-assemble (Flow 5 swap)
```

- The invite always explains **why** she was chosen (her skill's role), building trust.
- Accepting/declining is one tap; the consequence is read aloud.

---

## 7. My work (member)

```
[My work]
  • Interested — opportunities you raised your hand for (status)
  • Teams — teams you've joined (order, your part, teammates)
  (tap any) → detail with ▶ narration replay
```

Read-only status tracking in v1 (no payments/completion tracking yet — future scope).

---

## 8. Coordinator inbox & cluster view

```
[Inbox] → interested members per opportunity  ⤳ GET /coordinator/opportunities/{id}/interests
[Cluster] (P1) → cross-group skill capacity map for the CDS cluster
```

---

## 9. Cross-cutting flows

### 9.1 Listen-to-anything
Long-press any label or `(tap 🔊)` → that element is spoken in Malayalam. Applies app-wide.

### 9.2 Offline (P1)
If offline: last **[Find work]** feed and the UI shell load from cache with an "offline" indicator; voice/matching actions are disabled with a spoken explanation and retry.

### 9.3 Error & retry (voice-first)
Every error is spoken and shown in the interface's own Malayalam voice, states what happened, and offers one clear next action (retry / use icons / call coordinator). Errors never apologise or use jargon (see `UI_UX_DESIGN.md` copy rules).

---

## 10. End-to-end demo script (happy path)

1. Member signs in with phone-OTP, speaks "I can stitch and cook," confirms skills by voice. *(Flows 1–2)*
2. Coordinator posts a 200-piece uniform order; Loom flags it as a team order. *(Flow 4)*
3. Coordinator taps assemble → Loom proposes a five-woman team across two groups, shows coverage + animated path + Malayalam rationale, and confirms. *(Flow 5)*
4. Each member gets a spoken invite explaining her part; the first member taps Join. *(Flow 6)*
5. Separately, the same member opens Find work and hears an individual match explained in Malayalam with its path animated. *(Flow 3)*

This exercises every P0 flow and both matching modes, entirely in Malayalam voice + icons.
