# Loom — UI/UX Design

**Version:** 1.0
**Companion docs:** `PRD.md`, `TDD.md`, `USER_FLOWS.md`

This document gives the AI builder and the team a concrete visual and interaction spec: design thesis, tokens, typography, components, screen layouts, and copy rules. It is opinionated on purpose — build to it, don't average it toward a generic default.

---

## 1. Design thesis

The product is named **Loom**, and its whole idea is *weaving* scattered skills into income no one could reach alone. The interface should feel like a **handloom**: warp threads (women, groups) crossed by weft (opportunities), with the match rendered as a thread traced across the cloth. This is grounded in Kerala's own handloom heritage — the *kasavu* (undyed cotton with a gold border) and traditional *indigo* dye — which also happens to be the exact world these women work in.

**One-line direction:** a calm, warm, handwoven-feeling app; **indigo-forward**, with a single precious **gold** accent, and one signature moment — the match path woven across the graph.

We deliberately avoid the generic AI look (cream + terracotta + serif, or black + acid-green). The base is undyed-cotton, but the dominant colour is **indigo**, the accent is **kasavu gold used sparingly**, and secondaries come from natural dyes (turmeric, madder). That's a choice from the subject, not a template.

---

## 2. Design tokens

### 2.1 Colour

| Token | Hex | Role |
| --- | --- | --- |
| `--cotton` | `#F3EFE6` | Base background (undyed handloom cotton) |
| `--cotton-deep` | `#E7E0D2` | Cards, raised surfaces |
| `--indigo` | `#26364F` | Primary — text, primary buttons, graph nodes (women) |
| `--indigo-soft` | `#4C6284` | Secondary indigo, edges, hover |
| `--kasavu` | `#C9A227` | **Accent** — the woven path, "gold thread"; used sparingly |
| `--turmeric` | `#D98B21` | Opportunity nodes / calls to action needing warmth |
| `--madder` | `#9C3B36` | Alerts, decline, errors (used quietly, not shouty) |
| `--leaf` | `#5B7A5B` | Success / "team complete" |
| `--ink` | `#1C1A17` | Highest-contrast text on cotton |

Contrast: body text `--ink`/`--indigo` on `--cotton` clears WCAG AA. Never place `--kasavu` text on `--cotton` for body copy (fails contrast) — gold is for the thread/accents, not paragraphs.

### 2.2 Typography

Malayalam legibility is a real design constraint, not an afterthought — these users read Malayalam, often at low literacy.

| Role | Face | Notes |
| --- | --- | --- |
| Display / headings | **Manjari** (Malayalam) | Community-made, characterful, warm; the app's voice |
| Body (Malayalam) | **Noto Sans Malayalam** | Maximum legibility at small sizes |
| Latin / numerals | **Inter** | For numbers (distance, pay, rate, quantity), Customer/admin |

Type scale (mobile-first): 28 / 22 / 18 / 16 / 14. Body min 16px. Numerals (pay, distance, size) get one step up and medium weight — numbers are how low-literacy users read the app's most important facts.

### 2.3 Space, shape, motion

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32.
- Radius: 14px on cards/buttons — soft, cloth-like, not sharp.
- Touch targets: **≥ 56px** minimum (older devices, older hands).
- Motion: mostly still. The **one** orchestrated motion is the woven path (§4). Respect `prefers-reduced-motion` — path draws instantly instead of animating.

---

## 3. Signature element — the woven match path

When a match is explained, the graph view **weaves the gold thread** from the woman (or team) through her skill(s) to the opportunity, one segment at a time, synced to the Malayalam narration:

- Nodes: women = `--indigo` discs with initials/photo, skills = `--cotton-deep` chips with icons, opportunity = `--turmeric` tile.
- The winning path animates in `--kasavu` as if a thread is being drawn across a loom (~1.5s, easing), while TTS speaks the reason.
- For a **team**, multiple indigo threads converge into the opportunity — visually "no one could reach it alone" becomes literal.
- Rendered with Cytoscape.js; layout is cluster-scoped so it stays legible.

This is the memorable moment (PRD "Demo Moment"). Everything else stays quiet so this lands.

---

## 4. Core components

| Component | Spec |
| --- | --- |
| **Mic button** | Large circular `--indigo`, gold ring on active listening; the primary input affordance. Pulses softly while recording. |
| **Skill chip** | Icon + Malayalam name; tap to add/remove; selected = `--indigo` fill. Every skill has an illustrated icon (icon set is a P0 asset). |
| **Match card** | Big icon/image, title (Manjari), numerals for distance + pay, prominent ▶ play. One card = one opportunity. |
| **Play (▶) button** | Consistent everywhere; triggers Malayalam narration + path animation. Same icon in feed and detail. |
| **Team panel** | Row of provider discs (grouped by SHG colour band), each with assigned-skill icon + covered units; coverage bar (required vs covered). |
| **Listen 🔊** | Persistent; reads current screen's key action. Long-press any label to hear it. |
| **Bottom nav** | 4 items, icon + Malayalam label, ≥56px, current item in `--indigo`. Provider: *Current · Requests · Communities · Profile*. Customer: *Browse · Request · Accepted · Profile*. |
| **Provider card** | For the Customer directory: name/shop (Manjari) · ★ rating · rate + delivery (numerals) · distance · skill icons · portfolio thumb. `(tap)` → profile. |
| **Filter bar** | Distance slider (within N km), experience tiers (any / 1+ / 3+ / 5+, as tappable chips), price range — all ≥56px, icon-labelled, voice-readable. Active filters shown as removable chips. |
| **Rating display** | ★ 0–5 in `--kasavu` (gold, sparingly), numeric aggregate + review count. Display only. |
| **Portfolio grid** | 2–3 col image grid of uploaded work; `(tap)` enlarges; each has a spoken caption via 🔊. |
| **Rate + delivery tag** | Numerals + icon (₹ + clock); one step-up type size (numbers carry the message). |
| **Request form** | Customer: description, skill multi-select, no. of ppl, **individual/group segmented toggle**, units, location, pay, deadline. Large targets; voice entry per field. |
| **Chat thread** | Bubbles; incoming has a 🔊 read-aloud; composer has a 🎤 mic (voice-to-text) + text. |
| **Accept/decline** | Provider request card: big ✓ (`--leaf`) / ✗ (`--madder`) buttons, ≥56px, consequence read aloud. |

Icon-first everywhere; text always paired with an icon so meaning survives low literacy. Customer surfaces may lean more on text, but keep the same tokens and target sizes.

---

## 5. Screen layouts (ASCII wireframes, mobile)

**Provider Home / Find work**
```
┌───────────────────────────────┐
│  Loom            🔊            │
│  നിങ്ങൾക്ക് അടുത്തുള്ള ജോലി        │  ← "work near you" (Manjari)
├───────────────────────────────┤
│ ┌───────────────────────────┐ │
│ │ [icon]  തയ്യൽ ഓർഡർ        ▶ │ │  ← match card
│ │ 3 km · ₹1200               │ │
│ └───────────────────────────┘ │
│ ┌───────────────────────────┐ │
│ │ [icon]  പാചക ഓർഡർ         ▶ │ │
│ │ 1.5 km · ₹800              │ │
│ └───────────────────────────┘ │
├───────────────────────────────┤
│ 📋 നിലവിൽ  📨 അഭ്യർത്ഥന 💬 👤  │  ← Current · Requests · Communities · Profile
└───────────────────────────────┘
```

**Match detail (with woven path)**
```
┌───────────────────────────────┐
│  ‹ back                  🔊    │
│                               │
│     ●You ══thread══► ▣Order   │  ← gold path animates
│         │                     │
│     ◇stitching                │
│                               │
│  ▶  (playing Malayalam)       │
│  3 km · ₹1200 · 200 pieces    │
│                               │
│  [   ✋  എനിക്ക് താൽപ്പര്യമുണ്ട്  ]│  ← "I'm interested"
└───────────────────────────────┘
```

**Proposed team (Customer)**
```
┌───────────────────────────────┐
│  Team for: 200 uniforms       │
│                               │
│   ●──┐                        │
│   ●──┼──══threads══► ▣ request│  ← threads converge
│   ●──┤                        │
│   ●──┘                        │
│  Coverage: cutting·stitching· │
│            finishing   ✓ full │
│  Why these women: [rationale] │
│  [ ✓ Confirm ]   [ ⤿ Swap ]   │
└───────────────────────────────┘
```

**Customer Browse + filters**
```
┌───────────────────────────────┐
│  ‹ back   തയ്യൽ (tailoring)    │
│  [ within 5km ▾ ][ 3+ yrs ▾ ] │  ← filter chips
│  [ ≤ ₹500 ▾ ]                 │
├───────────────────────────────┤
│ ┌───────────────────────────┐ │
│ │ [◍] Ammu's Tailors  ★4.8   │ │  ← provider card
│ │ ₹450/pc · 2 days · 2.1 km  │ │
│ │ 🧵 stitching  ✂ cutting    │ │
│ └───────────────────────────┘ │
│ ┌───────────────────────────┐ │
│ │ [◍] Reena (solo)   ★4.5    │ │
│ │ ₹400/pc · 3 days · 4.4 km  │ │
│ └───────────────────────────┘ │
├───────────────────────────────┤
│  🔎 Browse  ➕ Request 📥 👤   │  ← Browse · Request · Accepted · Profile
└───────────────────────────────┘
```

**Provider profile (viewed by Customer)**
```
┌───────────────────────────────┐
│  ‹ back                   💬   │
│  [◍] Ammu's Tailors           │
│  ★4.8 (32) · 👥 4 ppl         │  ← rating · capacity
│  ₹450/pc · ⏱ 2 days           │
│  🧵 stitching  ✂ cutting      │
│  ┌────┐┌────┐┌────┐  portfolio │
│  │work││work││work│           │
│  └────┘└────┘└────┘           │
│  [ ✋ Request ]   [ 💬 Chat ]  │
└───────────────────────────────┘
```

**Customer request form**
```
┌───────────────────────────────┐
│  New request              🎤   │
│  Description [_____________]   │
│  Skills  🧵 ✂ + …             │
│  No. of ppl [ 5 ]             │
│  ( ◉ individual  ○ group )    │  ← mode toggle
│  Units [ 200 ]                │
│  Location 📍   Pay ₹   By 📅   │
│  [        Submit        ]     │
└───────────────────────────────┘
```

**Chat thread (Communities)**
```
┌───────────────────────────────┐
│  ‹ Ammu's Tailors         🔊   │
│  ┌───────────────┐            │
│  │ rate for 200? │ (them) 🔊  │
│  └───────────────┘            │
│           ┌────────────────┐  │
│           │ ₹450/pc, 2 days │  │ (you)
│           └────────────────┘  │
│  [ 🎤  type a message… ] [➤]  │  ← mic-to-send + text
└───────────────────────────────┘
```

---

## 6. Accessibility & inclusivity floor (non-negotiable)

- **Voice + icons complete every P0 Provider flow** without reading English — including skill entry (with canonical read-back), filters, incoming request accept/decline, and chat (mic-to-send + 🔊 read-aloud). Customer surfaces may use text but keep the same target sizes and tokens.
- Touch targets ≥56px; body ≥16px; AA contrast throughout.
- Visible keyboard focus; screen-reader labels in Malayalam.
- `prefers-reduced-motion` honoured (path draws instantly).
- Works on small, low-DPI screens and intermittent networks (PWA shell caches).
- Every icon is paired with a Malayalam label and an audio option.

---

## 7. Copy rules (Malayalam-first, but principles apply to all strings)

- **Name things by what the user does**, not how the system works: "Find work," "Join team," "I'm interested" — never "Submit query" or "Execute match."
- **Active voice, action = outcome:** the button that says "Join" produces a spoken "You're on the team."
- **Errors direct, don't apologise:** say what happened and the one next step, in the app's own Malayalam voice. No jargon, no "oops."
- **Empty states invite action:** "Add a skill to see work near you," with the tap that does it.
- **Numbers carry the message:** distance, pay, and quantity as numerals + icons, since they read across literacy levels.
- One element, one job: a label labels, the ▶ plays, the mic listens.

All user-facing strings live in the i18n Malayalam catalogue (`react-i18next`); English is a developer/fallback locale only.

---

## 8. What to avoid

- No dense text screens; no English-only paths in Provider flows.
- No decorative motion competing with the woven path.
- No gold (`--kasavu`) for body text or large fills — it's a thread, not a wall.
- Not the generic AI aesthetic (cream+terracotta serif / black+neon). If a screen starts to look like that, it's drifted from the brief.
