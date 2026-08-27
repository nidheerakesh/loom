# Loom — Slide Brief

**For whoever is building the deck. Presentation: 16 August 2026.**

Read this first: **15 slides for a 9-minute talk**, inside a 15-minute slot — the rest is Q&A,
which `4-VIVA-QA.md` covers. That is roughly 35 seconds per slide, and the demo eats 3 minutes
of it. So slides carry *almost no text* — the speaker carries the words, and the script
(`2-SCRIPT.md`) is written to match these slides in this order. If you change the order, tell
the speaker.

**Budget:** 9 min talk · 5 min Q&A · 1 min of walking to the front and plugging in. Do not build
to fill 15 — a talk that ends early and answers well beats one that gets cut off.

**The one rule.** A judge should be able to follow the argument with the sound off, and the
speaker should never read a slide aloud. If a slide has a sentence the speaker also says, cut
the sentence from the slide.

---

## Design constraints

| | |
|---|---|
| Aspect | 16:9 |
| Font | One sans for everything. Big. Nothing under 24pt; body text 28pt+ |
| Palette | Take it from the app so the deck and the demo look like one thing: `cotton #F3EFE6` background · `indigo #26364F` text · `kasavu #C9A227` for the one thing you want looked at · `madder #9C3B36` sparingly for problems |
| Words per slide | Six or fewer, except the two table slides |
| Images | From `docs/images/` in the repo — already cropped and named. **Do not re-screenshot.** |
| Build/animation | None, except slide 5. Animations eat time and break on strange projectors |

---

## Slide-by-slide

### 1 · Title
**Loom**
*Turning skills into income no one could reach alone*

Small, bottom: team names · IIIT Kottayam · Girlathon · BharatNext track.
Nothing else. No logo soup.

---

### 2 · The problem, in one number
Full-bleed, four numbers, nothing else:

> **8.5M+** self-help groups  **4.5M** women in Kudumbashree
> **13.9%** of women have ICT skills (vs 22.8% of men)

Then one line, large, in `kasavu`:

> **Credit reached them. The market didn't.**

*Speaker beat: this is where the pitch is won or lost. The slide must not compete with him/her.*

---

### 3 · The gap nobody solves
Two boxes side by side.

| **Invisible demand** | **Unreachable income** |
|---|---|
| Paid work three kilometres away that she never hears about | A 200-piece uniform order no single woman can take |

Under the second box, in `kasavu`: **This one has no product at all.**

---

### 4 · What Loom does
Two rows, icon or simple shape on the left:

- **Individual** — ranks nearby work for one woman
- **Collective** — assembles a *team across several groups* for orders too big for anyone

Bottom line: **Explained in Malayalam. Spoken aloud.**

---

### 5 · The one that matters — *the only animated slide*
Build in three clicks:

1. One order: **30 school uniform sets** — cutting + stitching + packaging
2. Nobody can take it alone → show a single figure greyed out
3. → **team assembled across 6 groups, coverage complete**

Use `docs/images/11-team-assembly.png` as the payoff, or rebuild it as a clean graphic if you
have time. The screenshot is more credible; a graphic is prettier. **Pick credible.**

---

### 6 · LIVE DEMO
One word on the slide: **Demo**, and the URL underneath in large type:
`loom-lovat-phi.vercel.app`

The speaker switches to the browser here. Have this slide up when they switch back.

---

### 7 · Under the hood
The architecture diagram from `docs/PROGRESS.md` §5, redrawn cleanly. Four boxes, top to bottom:

`Browser (Malayalam-first)` → `one serverless function, 42 routes` → `matching · geo · skills ·
chat authorisation` → `Postgres, 24 tables, RLS on all`

One line under it: **The browser never touches the database.** *(Speaker explains why — it's a
security answer, not an architecture one.)*

---

### 8 · How the matching works
Three boxes, left to right, with an arrow:

`skill fit 0.5` → `proximity 0.3` → `pay 0.2`

Under it: **Deterministic. Same data, same team, every time.**
Small, at the bottom: *no model, no training data, no inference cost*

---

### 9 · The hard problem you didn't expect
Title: **"covering" is not "cooking"**

Show the failure and the fix as two lines:

```
similarity("covering", "catering") = 0.56  →  filed under cooking  ✗
```
```
"garment finishing"  →  തയ്യൽ   (shares almost no letters)  ✓
```

Bottom: **Meaning lives in a curated table. Similarity only catches typos.**

*This slide makes a judge sit up. Don't cut it.*

---

### 10 · Team assembly, as an algorithm
Three lines, monospace, one per sort key:

```
1. proficiency   (best at the skill)
2. distance      (nearest)
3. creation order (so ties never reorder)
```

Under it: **Capacity-aware. Reports honestly when it cannot cover an order.**

---

### 11 · Security — what we found in our own app
Four rows, `madder` for the problem, `indigo` for the fix:

| Found | Fixed |
|---|---|
| Anyone could read every message in the app | Browser no longer touches the database |
| Chat list returned everyone's threads | Scoped to participants |
| Any thread readable by ID | 404, not 403 — so IDs can't be probed |
| One shared thread per provider | Keyed on both parties |

---

### 12 · Built and measured
Table, six rows, nothing else:

| | |
|---|---|
| API routes | 42 across 11 areas |
| Database | 24 tables, row-level security on all |
| Landing screen | **21.0s → 1.35s** |
| Payload | 438 KB → 221 KB |
| Automated checks against production | **78 / 78 passing** |
| Security | 4 chat vulnerabilities found and closed |

Put `21.0s → 1.35s` and `78/78` in `kasavu`. They are the two numbers a judge remembers.

---

### 13 · Where we are, honestly
Two columns:

**Working today** — deployed, Malayalam-first, individual + collective matching, spoken
explanations, chat, ratings

**Not yet** — speech *input*, real GPS locations, admin surface, **and no pilot user yet**

Then, large, in `kasavu`: **Next: one real order, from one real group.**

*Do not soften this slide. It is the reason the rest is believed.*

---

### 14 · Roadmap
Five items, numbered, no dates except the first:

1. **Pilot with one Kudumbashree cluster** — next
2. Real GPS locations
3. Speech *input* in Malayalam
4. Admin surface for grievances
5. Live opportunity feeds from panchayat and enterprise

---

### 15 · Close
**Loom**
*It finds the work that was invisible, and the income that was unreachable alone.*

QR code to `loom-lovat-phi.vercel.app`, and the repo URL.

---

## Backup slides — after slide 11, not shown unless asked

- **B2** The three deployment faults that each reported success (§7.2)
- **B3** Chat privacy: the four holes and the RLS root cause (§7.6)
- **B4** UML: use case + class diagram (`docs/images/15`, `17`)
- **B5** Cost model: free tier, no per-match model cost, TTS on device

If a judge asks something technical, going to a backup slide instead of talking is worth a lot.

---

## Division of work — suggested

| Who | What | Done by |
|---|---|---|
| Slide builder | Slides 1–4, 7–12, 14, 15 + backups | tonight |
| Whoever owns the demo | Slides 5, 6, 13 — these depend on the app state | tonight |
| Speaker | Rehearse `2-SCRIPT.md` twice out loud, timed; read `4-VIVA-QA.md` once | tonight + morning |

**Export to PDF as well as PPTX.** Fonts do not survive strange laptops; PDF does.
