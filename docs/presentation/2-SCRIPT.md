# Loom — Speaking Script

**6 minutes.** Timings are cumulative. `[CUT]` marks what to drop if you are given 4 minutes;
`[ADD]` marks what to say if you are given 8 or 10.

Read this out loud twice before tomorrow. Not in your head — out loud, with a timer. The
sentences are written to be *spoken*, so they will feel slightly short on the page and correct
in the room.

**Two rules.** Do not read the slides. And when the demo works, stop talking and let the judges
watch it for three seconds.

---

## 0:00 — Slide 1 · Open

> Kerala has four and a half million women in Kudumbashree self-help groups.
>
> They have credit. They have skills. What they don't have is the market.

*Pause. Then move.*

---

## 0:15 — Slide 2 · The problem

> Microfinance solved money. Nobody solved demand.
>
> A woman who stitches can't see a paid job three kilometres away, because work travels by word
> of mouth. And that's the small problem.

*Click to the `kasavu` line.*

> Credit reached them. The market didn't.

---

## 0:45 — Slide 3 · The gap

> The big problem is the one no platform even represents.
>
> A school needs two hundred uniforms. That order is worth more than any of these women earns in
> a month. **No single woman can take it.** So it goes to a factory in the city, and the money
> leaves the district.
>
> Not because the skill isn't there. Because nothing assembles it.

---

## 1:15 — Slide 4 · What Loom does

> Loom does two things. It ranks nearby work for one woman — that part is a job board, and job
> boards exist.
>
> And it does the part that doesn't exist: it takes an order too big for anyone, and builds a
> team across *different* self-help groups to fulfil it.
>
> Everything it decides, it explains in Malayalam, and it can read that explanation out loud.

---

## 1:45 — Slide 5 · The headline *(animated)*

> Here is what that means concretely.
>
> *(click)* Thirty school uniform sets. Cutting, stitching, packaging — three different skills.
>
> *(click)* No one woman has all three, and no one woman has the capacity.
>
> *(click)* Loom assembles a team across six groups, checks that every skill is covered, and
> tells the customer so.
>
> That is the whole idea. Everything else is engineering.

---

## 2:15 — Slide 6 · **DEMO** *(2 minutes — rehearse this until it is boring)*

*Switch to the browser. Two windows already open and signed in — customer left, provider right.*

> This is running live. Anyone here can open it on their phone right now.

**Beat 1 — Malayalam-first** *(15s)*
*Show the sign-in screen.*
> It opens in Malayalam, not English. Phone number and a code — no password, and we never ask
> her name before she's verified.

**Beat 2 — the skill problem** *(20s)*
*Show the onboarding readback: `stiching → തയ്യൽ`, `coocking → പാചകം`.*
> She typed both of these misspelled. Loom read them back as the canonical skills — and in
> Malayalam. If it didn't do this, "sewing", "tailoring" and "thayyal" would become three
> different skills, and the marketplace would quietly stop working.

**Beat 3 — the collective match** *(50s — this is the demo)*
*Customer window. Open the 30-uniform order. Tap Assemble team.*
> One tap.

*Let it render. Say nothing for two seconds. Then read the app's own rationale off the screen:*
> Providers across multiple groups, coverage complete. It's telling me its reasoning, not just
> its answer.

*Scroll the member list.*
> Different groups. That's the thing a job board cannot express.

*Tap Replace on one member.*
> And the customer stays in control — she can swap anyone before she commits.

**Beat 4 — consent** *(25s)*
*Switch to the provider window, My work — empty.*
> Now look at the provider's screen. Nothing. The team is still a draft.

*Back to customer, Confirm. Then provider window, refresh.*
> Now the invitation appears. **Nobody is assigned work she hasn't agreed to.**

**Beat 5 — voice** *(10s)*
*Tap Listen.*
> And she can hear it, in Malayalam.

*[If the device has no Malayalam voice, the button shows the text instead. If that happens, say:
"On this laptop there's no Malayalam voice installed, so it shows the text — it refuses rather
than reading Malayalam in an English accent." Then move on. Do not apologise twice.]*

*Switch back to the slides.*

---

## 4:15 — Slide 7 · How it decides

> The ranking is a weighted score — skill fit, distance, pay. And the team assembly is a
> capacity-aware covering search.
>
> It's deterministic. The same order always produces the same team. That matters, because this
> system decides who earns money — and a black box that can't explain itself has no business
> doing that.

**[ADD if you have time]**
> It also means no model to train, no inference cost, and every match is auditable after the
> fact. We write the reasoning to a table before we render a single word of it.

---

## 4:45 — Slide 8 · The unexpected hard part

> One thing we got wrong, because it's the interesting part.
>
> We matched skills by text similarity. And it decided "covering" meant "cooking" — because the
> letters are close to "catering". Two words that differ by two letters are not related. They
> just look alike.
>
> So similarity now only catches *typos*. Meaning lives in a curated table of about a hundred
> and ten phrases, in English, Malayalam and Manglish — which is why "garment finishing" maps to
> തയ്യൽ even though they share almost no letters.

---

## 5:15 — Slide 9 · Built and measured

> Forty-two API routes. Twenty-four tables, row-level security on every one.
>
> The main screen took twenty-one seconds when we first measured it. It takes one point three
> now — that was N-plus-one queries, and our server running in Washington while our users are in
> Kerala.
>
> And seventy-eight automated checks run against the live deployment. All passing. That harness
> is in the repo; you can run it yourself.

**[CUT the middle paragraph if short on time. Keep 78/78.]**

---

## 5:45 — Slide 10 · Honest status

> What's not done: speech *input* — she can hear it, she can't speak to it yet. Locations are
> placeholders. There's no admin screen.
>
> And the big one: **no self-help group has used this yet.** We built and hardened it this
> month. We haven't put it in front of a woman.
>
> That's the next milestone, and it's not a feature.

*Say this evenly. It is a strength, not a confession.*

---

## 6:00 — Slide 11 · Close

> Loom finds the work that was invisible, and the income that was unreachable alone.
>
> Thank you.

---
---

# Q&A — prepared answers

**"How is this different from a job board / Urban Company / Apna?"**
> Every one of those matches one person to one listing. None of them can represent an order that
> requires four people who don't know each other, from different groups. That's not a feature
> they're missing — their data model can't express it.

**"How many users do you have?"**
> None yet. The system went live this month and we spent that month making it correct and secure
> rather than recruiting. Our next milestone is one pilot session with one Kudumbashree unit —
> one woman, one order, us sitting beside her.

*Do not pad this. The short honest answer scores better than a long one.*

**"Is the matching actually AI?"**
> It's a deterministic optimisation — a weighted ranking plus a capacity-aware covering search.
> We chose that over a learned model deliberately: with no outcome data yet, a model would be
> guessing, and it couldn't explain itself. Once we have completed-order data, that becomes the
> training set. The explanation layer is downstream of the decision, so it can never contradict
> it.

**"What stops a woman being assigned work she can't do?"**
> Two things. Capacity is a hard constraint in the assembly — nobody gets more units than she
> declared. And nothing reaches her until the customer confirms; then she still has to accept.
> We showed both in the demo.

**"How do you make money?" / "Is it sustainable?"**
> It runs at near-zero cost today — free-tier hosting, no per-match model cost, speech happens
> on the device. The realistic model is a small commission on fulfilled orders, or being funded
> as infrastructure by the federation itself, because we increase the income it already exists
> to grow.

**"Why Malayalam only?"**
> Because we're building for Kudumbashree first and a half-built Malayalam experience is worse
> than none. The language layer is a table of strings and a font — adding Tamil or Kannada is a
> day's work, not a rewrite.

**"What was the hardest part?"**
> Three deployments that reported success while being completely broken — green build, "Ready"
> status, dead site. It taught us the thing we now do every time: one real request against the
> deployed URL is what closes the loop. That's why we have 78 automated checks running against
> production rather than a local test suite.

**"Security?"**
> We audited chat and found conversations were readable four different ways — including through
> the anon key that ships in the browser bundle. All four are fixed, row-level security is on
> all twenty-four tables, and the browser no longer talks to the database at all.

**If you don't know an answer:**
> We haven't tested that yet — it's a good question, I'll note it.

That answer costs you nothing. Inventing one costs you everything, because the next question
will be about the thing you invented.
