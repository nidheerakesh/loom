# Loom — Speaking Script

**9 minutes of talking, inside a 15-minute slot.** The remaining time is Q&A — prepare that from
`4-VIVA-QA.md`, which matters at least as much as this.

Timings are cumulative. `[CUT]` marks what to drop if you are running long; `[TRIM]` marks a
paragraph you can shorten without losing the thread. **Aim to finish at 9:00, not 14:00.** A talk
that ends early and answers questions well beats one that gets cut off mid-demo.

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

## 2:15 — Slide 6 · **DEMO** *(3 minutes — rehearse this until it is boring)*

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

**Beat 3 — the collective match** *(70s — this is the demo)*
*Customer window. Open the 30-uniform order. Tap Assemble team.*
> One tap.

*Let it render. Say nothing for two seconds. Then read the app's own rationale off the screen:*
> Providers across multiple groups, coverage complete. It's telling me its reasoning, not just
> its answer.

*Scroll the member list.*
> Different groups. That's the thing a job board cannot express.

*Tap Replace on one member.*
> And the customer stays in control — she can swap anyone before she commits. These alternatives
> are ranked the same way, and anyone already on the team is excluded.

**Beat 4 — consent** *(35s)*
*Switch to the provider window, My work — empty.*
> Now look at the provider's screen. Nothing. The team is still a draft.

*Back to customer, Confirm. Then provider window, wait for the poll.*
> Now the invitation appears. **Nobody is assigned work she hasn't agreed to** — and once she
> accepts, the customer can no longer swap her out. Only someone who declined can be replaced.

**Beat 5 — voice** *(10s)*
*Tap Listen.*
> And she can hear it, in Malayalam.

*[If the device has no Malayalam voice, the button shows the text instead. If that happens, say:
"On this laptop there's no Malayalam voice installed, so it shows the text — it refuses rather
than reading Malayalam in an English accent." Then move on. Do not apologise twice.]*

*Switch back to the slides.*

---

## 5:15 — Slide 7 · Under the hood

> Architecturally this is deliberately boring. The browser talks only to our API, on the same
> origin. That's one serverless function routing to forty-two handlers, over Postgres with
> row-level security on all twenty-four tables.
>
> The one line worth noticing: **the browser never touches the database.** I'll come back to why.

---

## 5:45 — Slide 8 · How it decides

> The ranking is a weighted score — skill fit, distance, pay. And the team assembly is a
> capacity-aware covering search.
>
> It's deterministic. The same order always produces the same team. That matters, because this
> system decides who earns money — and a black box that can't explain itself has no business
> doing that.

> It also means no model to train and no inference cost — and every match is auditable, because
> we write the reasoning to a table before rendering a single word of it.

---

## 6:15 — Slide 9 · The unexpected hard part

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

## 6:45 — Slide 10 · How the team gets built

> The assembly itself is a capacity-aware covering search. Candidates sort by proficiency, then
> distance, then creation order — that third key exists because Postgres IDs are random, and
> without it two identical runs could return different teams.
>
> It's greedy, not optimal — set cover is NP-hard and an exact solver would buy milliseconds of
> quality for seconds of latency. And when it *can't* cover an order, it says so, rather than
> handing back a partial team that looks complete.

**[CUT the second paragraph if running long. Keep the tiebreak sentence — it's the one that
sounds like engineering.]**

---

## 7:15 — Slide 11 · What we found in our own app

> We audited our own chat and found conversations were readable four different ways — including
> through the anonymous database key that ships inside every browser bundle.
>
> The root cause is the interesting part. Row-level security couldn't express "only participants"
> for us, because we don't use Supabase's own auth — so to Postgres, every browser visitor is the
> same anonymous role with no identity to filter on. The fix was to stop the browser talking to
> the database at all and move the check into the API, which knows who's asking.
>
> We lost live updates and now poll every seven seconds. We'd make that trade again.

---

## 7:55 — Slide 12 · Built and measured

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

## 8:20 — Slide 13 · Honest status

> What's not done: speech *input* — she can hear it, she can't speak to it yet. Locations are
> placeholders. There's no admin screen.
>
> And the big one: **no self-help group has used this yet.** We built and hardened it this
> month. We haven't put it in front of a woman.
>
> That's the next milestone, and it's not a feature.

*Say this evenly. It is a strength, not a confession.*

---

## 8:45 — Slide 14 · Roadmap

> Pilot first — one cluster, one real order. Then real locations, then speech input, then an
> admin surface, then ingesting opportunities directly from panchayat and enterprise feeds so
> demand arrives without anyone typing it in.

---

## 9:00 — Slide 15 · Close

> Loom finds the work that was invisible, and the income that was unreachable alone.
>
> Thank you — happy to take questions.

---

## Then: ~5 minutes of Q&A

The full preparation is in **`4-VIVA-QA.md`** — read it once tonight and once in the morning. The
eight answers below are the ones most likely to come first.

---

# Q&A — the eight most likely

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
