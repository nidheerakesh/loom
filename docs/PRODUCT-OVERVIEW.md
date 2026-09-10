# Loom — Product Overview

**For building the presentation deck. Reflects the app as deployed at loom-lovat-phi.vercel.app,
current as of this session — several sections here (group open call, coordinator, consent,
account deletion, voice input, Telegram) postdate the earlier deck docs in this folder
(`1-SLIDE-BRIEF.md` etc.), which describe an earlier state of the product. Use this file as the
source of truth for what actually exists today.**

Team: **Nidhi Rakesh · Niveditha G. S. · Anjana Nandakumar** — IIIT Kottayam, Girlathon (GDG On
Campus MACE), BharatNext: Building for Tier-2 and Tier-3 India.

---

## 1. The problem

Kerala's Kudumbashree network has **4.5 million women** in self-help groups (part of India's
**8.5 million+** women's SHGs). They have credit — microfinance solved that — and they have
skills. What they don't have is a market.

Two distinct gaps:

1. **Individual work travels by word of mouth.** A woman who can stitch has no way to learn
   about a paying job three kilometres away.
2. **Large orders go to a factory in the city.** Two hundred school uniforms, a wedding sadya
   for three hundred people — no single woman can take it alone, and cutting, stitching and
   packaging need more hands than any one SHG has. So the order — and the money — leaves the
   district, not because the skill isn't there, but because nothing assembles it.

## 2. What Loom does

**Two kinds of matching, one deterministic engine — no LLM, no training data, no inference
cost. A graph decides; templates narrate the decision in Malayalam.**

### Individual work
Ranks nearby jobs for one woman by skill fit, distance and pay. A job board — job boards exist
elsewhere, this one is Malayalam-first and voice-capable.

### Collective work — two ways to staff a group order
This is the part that doesn't exist anywhere else. A customer posts an order too large for one
person (200 uniforms, a large catering order), and it's staffed one of two ways:

- **Auto-assembly.** A capacity-aware, distance-aware set-cover search builds a team across
  different SHGs automatically. Deterministic — the same order always produces the same team.
  States its own coverage honestly ("4 providers across 2 groups cover stitching — coverage
  complete") rather than just an answer.
- **Open call.** The customer states a headcount and (optionally) a deadline to apply; any
  provider who can do the work applies through the same feed individual jobs use; she picks who
  she wants from the applicants, up to the headcount. Providers not selected are told, not left
  waiting indefinitely.

### Group coordinator
Every group order has one person accountable for it — the customer by default, or a provider
she appoints, who doesn't need to have applied to the job at all. The coordinator owns:

- **One agreed rate** for the whole team, instead of each member's own independent rate leaving
  room for the same job to be quoted at different prices to different people.
- **A shared reference photo** — what the finished work should look like, visible to the
  customer and everyone on the job, editable only by the coordinator.
- **A sign-off gate.** If the coordinator is an appointed provider (not the customer herself),
  the order cannot be marked finished until she signs off — the customer's "mark finished"
  control is disabled with a "waiting on coordinator" note until then. If the coordinator is the
  customer, completing the job *is* the sign-off — no extra step for someone who is already
  both sides of it.

### Skill canonicalization
`sewing`, `thayyal`, `തയ്യൽ`, and even the typo `stiching` all resolve to one canonical skill —
without this, a marketplace fragments into synonyms and quietly stops matching. New phrases
become their own skill and are reused, not duplicated, the next time someone says them.

### Voice, not just text
- **In the app**: skill entry has a mic button (Web Speech API, `lang=ml-IN`), for a woman who
  doesn't type. A spoken skill is never applied straight into her skill list — it lands in a
  review line first, since a misheard word (`പാചകം`/cooking vs `പഞ്ചകം`/a five-day period is one
  phoneme apart) needs a chance to be caught, the same as a typo does.
- **Over chat**: voice notes are transcribed (Sarvam/Bhashini), read back so she can catch a
  mistranscription, then acted on.
- **Narration**: every match decision can be read aloud in Malayalam, generated from the
  decision's own audit record — grounded, not a free-form model output.

### Two messaging channels, one engine
`_lib/messagingEngine.ts` is entirely channel-agnostic — it takes a phone number and whatever
text or transcribed voice a person sent, and returns what to say back. Two thin adapters sit on
top of it:

- **WhatsApp** — the real deployment. Identity is free: Meta/Twilio have already verified the
  sender's number.
- **Telegram** — a demo channel, added because Meta's WhatsApp Business review queue is slow
  and sending through it can cost money; a Telegram bot needs neither. `@LoomMarketPlace_bot`.
  Telegram never verifies a phone number, so a chat proves its number once (matched the same
  way sign-in resolves one) and that's remembered for later messages.

Both channels currently expose: individual jobs, **group open-call jobs** (tagged so she can
tell them apart), applying, team invitations, accept/decline, "my work" status, and voice
notes. Provider-side only — posting a job, selecting a team, and coordinator actions
(pattern photos, sign-off) are app-only.

### Browse and filters
A directory of providers, filterable by skill, distance and price — the customer's half of
"find someone nearby who can do this."

## 3. Privacy and security, by design

- **Phone numbers are never stored as given.** HMAC-SHA256 with a secret salt (not the earlier
  fnv1a, which was brute-forceable across the entire Indian mobile number space in seconds).
  The consent screen is honest about this: it says the number isn't shown to anyone, but does
  *not* claim the stored hash can never be traced back — an accurate claim, not an inflated one.
- **GPS is never stored exactly.** A captured reading either snaps to a named area already known
  (nothing new written, she shares a row with her neighbours) or is rounded to a ~1km grid cell
  and given a name relative to the nearest real place ("Near Aluva") — never shown as raw
  coordinates.
- **Consent before account creation.** A dedicated screen, checkbox unticked by default,
  enforced server-side (not just hidden by the UI) — between phone verification and the
  name/role form, so she knows what's kept before she's asked to hand it over.
- **Full account deletion.** Erases both roles if she holds both (a woman who stitches and also
  hires a caterer isn't left half-erased), in FK-safe order: storage objects before their rows,
  the audit trail (`matches`) before anything it references, and every message she authored
  scrubbed even from conversations that survive her. Requires retyping her own number — a live
  session token alone isn't enough, since the number is never shown back to her anywhere in the
  app, so someone holding just a stolen token doesn't have it memorised.
- **Row-level security is on for every table.** A table without RLS is readable by anyone
  holding the public anon key shipped in the JS bundle — this was found and fixed as a real
  vulnerability earlier in the project, not a theoretical one.
- **Chat is private and scoped.** A non-participant gets 404 (not 403) on a thread id, so its
  existence can't even be probed. Admins can read messages if needed to resolve a complaint —
  disclosed plainly in the consent copy, not hidden behind a narrower-sounding rule than the
  code actually enforces.

## 4. Verification discipline

Every feature above is proven against the **live production deployment**, not a local mock:

- **150 automated end-to-end checks, 0 failures** (`scripts/e2e.mjs`) — signs real accounts in
  through the actual phone+OTP flow, no fixtures, no direct database access. Covers both
  matching modes, the open call, the coordinator sign-off gate, consent, account deletion,
  location privacy, chat privacy, WhatsApp *and* Telegram, and authorisation boundaries.
- A separate demo pre-flight script confirms the exact accounts and order the live
  demo depends on are in a good state before presenting.
- Every change this session was deployed and re-verified against production before moving to
  the next one — nothing shipped on "looks right."

## 5. Technical architecture

- **Frontend**: React + Vite, Tailwind with CSS-variable design tokens (dark mode with zero
  `dark:` variants — tokens simply re-point), Malayalam-first (`lang="ml"` default), English
  toggle.
- **Backend**: Vercel serverless functions (`api/_routes`), a single typed route registry
  (`api/_routes/index.ts`) shared between production dispatch and local dev.
- **Database**: Supabase Postgres, RLS everywhere, 30 tables, 11 migrations tracking every
  schema change made after the initial schema (phone rehashing, RLS lockdown, group open call,
  consent, group coordinator, Telegram links, customer location confirmation).
- **Matching engine**: deterministic scoring (`skillFit`, `proximity`, `pay`, weighted) and a
  capacity-aware greedy set-cover for team assembly — no model, no training data, same input
  always produces the same output, which is what makes the audit trail meaningful.
- **Speech**: Bhashini/Sarvam for server-side transcription (WhatsApp/Telegram voice notes,
  narration playback), Web Speech API client-side for in-app skill entry.
- **Auth**: phone + OTP (Twilio Verify in production; a demo-OTP fallback shows the code
  on-screen for numbers Twilio's trial tier can't reach, or when disabled entirely for the demo)
  — no passwords, bearer-token sessions.

## 6. What's demo-only vs. real deployment

| | Demo | Real deployment |
|---|---|---|
| Messaging | Telegram (`@LoomMarketPlace_bot`) | WhatsApp Business API |
| OTP | On-screen fallback (`TWILIO_DISABLED`) | Real SMS via Twilio Verify |
| Seed data | ~40 fictional providers/customers, one 30-uniform order | One real pilot order, one real SHG |

Nothing about the underlying product differs between the two — same database, same matching
engine, same API, same UI. The demo-only pieces exist purely to remove dependencies (Meta's
review queue, SMS cost, Twilio's trial-tier number restriction) that would otherwise stand
between a judge and actually using the product tonight.

## 7. What's still ahead

- A real pilot order, from one real SHG — the actual milestone, not another feature.
- Fair rotation of work across providers (so it doesn't concentrate on whoever ranks highest
  every time).
- Voice input to the app itself, beyond skill entry.
- Making the repository public, WhatsApp's own Meta approval, and the handful of
  "only a human can do this" setup steps (rotating keys, admin phone allowlist, real area
  names for the pilot's actual geography).
