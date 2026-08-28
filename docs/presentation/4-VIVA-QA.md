# Loom — Viva & Q&A Preparation

Everything a panel can reasonably ask, with an answer you can say out loud in under thirty
seconds. Long answers are for reading, not for saying — the **bold first line** of each is the
answer; the rest is what you say only if they push.

**Three rules for the room.**

1. Answer the question asked, then stop. Silence after a short answer reads as confidence.
2. If you don't know: *"We haven't tested that — good question, I'll note it."* Never invent.
   The follow-up question will always be about the thing you invented.
3. Never say "basically", "just", or "simply". They shrink work that took a month.

---

## A · Problem, market, impact

**Why this problem?**
> Kudumbashree has 4.5 million women, credit and organisation already solved at enormous scale.
> The binding constraint now is market access — connecting local capability to paid demand. And
> the largest opportunities are structurally invisible, because they need more than one woman.

**Who exactly is the user?**
> Two. A provider — an individual woman or a small SHG-run unit. And a customer — a school
> needing uniforms, a hall needing catering, a shop needing packaging. The provider is who we
> designed for; the customer is who pays.

**Isn't this just a job board?**
> A job board matches one person to one listing. The order that would change a woman's income —
> two hundred uniforms — cannot be represented in that model at all. It isn't a missing feature,
> it's a missing data model. We assemble a team across groups, which is a covering problem, not
> a search problem.

**Why not just let Kudumbashree coordinators do this?**
> They already do, within a cluster, and they're good at it — they have the trust we don't. What
> a coordinator can't do is see across clusters she isn't part of, or hold forty women's
> capacity in her head. We're a computational layer over the network she already runs, not a
> replacement for her.

**How many users do you have?**
> None yet. The system went live this month and we spent the month making it correct and secure.
> Our next milestone is one pilot session with one Kudumbashree unit.

*Say it in that order — the fact, then what we did instead, then the plan. Do not pad.*

**How will you get the first users?**
> Through a CDS — the community development society above the groups. One cluster, one
> coordinator who already knows the women, one real order. We're not doing cold acquisition;
> the network exists and has its own leadership.

**What's the business model?**
> It costs near zero to run today — free-tier hosting, no per-match model cost, speech happens on
> the device. Realistically it's either a small commission on fulfilled orders, or funded as
> infrastructure by the federation, because we increase the income it already exists to grow.

**What's the impact if it works?**
> It raises the earning ceiling, not just access. A woman doing individual work is capped at what
> she can produce alone. Collective fulfilment breaks that cap, and matching is
> proximity-weighted, so the money stays in the district.

**How do you measure success?**
> Orders fulfilled, and income per provider before versus after. Not signups. A marketplace with
> users and no completed transactions has failed.

---

## B · The core technical decisions — and why

*These are the questions that separate a team that built something from a team that assembled
something. Know the reasoning, not just the choice.*

### Why deterministic matching instead of machine learning?

> **Because we have no outcome data, and because this system decides who earns money.**
>
> A learned model needs examples of good matches. We have zero completed orders, so a model
> would be guessing with extra steps. And a black box that can't say *why* it excluded a woman
> from paid work is not something we're willing to deploy. Our ranking is a weighted score, the
> team assembly is a covering search, and every decision is written to an audit table before a
> single word of explanation is rendered — so the explanation can never contradict the decision.
>
> Once we have completed-order data, that becomes the training set. The determinism is a
> starting point, not an ideology.

**Follow-up: "So there's no AI in it?"**
> There's an optimisation engine, not a learned model. We use language models for exactly one
> thing — naming a genuinely new skill in Malayalam when someone types something we've never
> seen. No model influences a match. That separation is deliberate: an LLM in the decision path
> can hallucinate, and here a hallucination means someone doesn't get paid.

### Why a greedy algorithm for team assembly?

> **Set cover is NP-hard, and greedy is the standard approximation with a proven bound.**
>
> Exact optimisation on a cluster of a few hundred providers would be milliseconds of value for
> seconds of latency and a lot of complexity. Greedy gives a logarithmic approximation, runs in
> well under a second, and — this matters more — it's explainable. We sort candidates by
> proficiency, then distance, then a creation-order tiebreak, and take the best available until
> the order is covered or we run out.

**Follow-up: "Is the team optimal?"**
> Not guaranteed optimal, and we don't claim it. It's a good feasible cover, produced
> deterministically, with the coverage state reported honestly — if we can't cover the order, we
> say so rather than returning a partial team as if it were complete.

**Follow-up: "What's the complexity?"**
> Roughly the number of required skills times candidates log candidates, per pass, and it
> terminates when no pass makes progress. In practice one or two passes over a few hundred rows.

### Why is there an explicit tiebreak column?

> **Because we migrated from Convex to Postgres and determinism silently broke.**
>
> Convex IDs are creation-ordered; Postgres UUIDv4 is random. Two identical runs could return
> different teams when scores tied, and nothing in any log said so. We added `seq bigserial`
> columns on `providers` and `team_members` and sort on them last. It's a one-line fix for a bug
> that would have destroyed the reproducibility claim.

### Why TypeScript everywhere, when your TDD specified Python and FastAPI?

> **One language, one deployment, same-origin API.**
>
> The design specified a separate Python service. In practice that means CORS, two deploy
> pipelines, two dependency sets and a second thing to keep alive — for a team of three, the
> week before a deadline. TypeScript on Vercel serverless gives us `/api/*` on the same origin as
> the app, one build, one place to look when it breaks. The matching logic is arithmetic; it
> doesn't need NumPy.

### Why Supabase and not Convex, which you started on?

> **Postgres was always the target. Convex was a deliberate scaffold to get something runnable
> fast, and we migrated when we needed to deploy publicly.**
>
> Our technical design document specifies PostgreSQL, and says in as many words that the Convex
> build is "the fast path to a locally runnable demo" while "the design below remains the target
> production architecture". So the migration was returning to the plan, not escaping a problem.
> What forced the timing was deployment: we needed a public URL a judge could open, and that
> meant the real stack.
>
> It cost us about a week and taught us the most useful lesson of the project — Convex IDs are
> creation-ordered, Postgres UUIDs are random, so our deterministic ranking silently started
> returning different teams on identical runs, with nothing in any log. That is where the
> explicit `seq` tiebreak columns come from.

**Follow-up: "Why did you need Postgres at all?"**
> Three jobs the design gave it, and one we found out afterwards.
>
> **The audit log.** Every match is written to a `matches` row — score breakdown and all —
> *before* any explanation is rendered. That ordering is what makes the explanation unable to
> contradict the engine, and it wants an immutable relational record.
>
> **The data is genuinely relational.** Providers, skills, requests, teams, members, interests —
> 24 tables with foreign keys between them. Team assembly is a join problem, and we later found
> out how much: the landing screen took 21 seconds because we were resolving relations in
> JavaScript loops instead of SQL. Doing it as joins is what took it to 1.3.
>
> **pgvector.** The design specifies 768-dimension embeddings for semantic skill matching. We
> haven't built that — the alias table does that job today — but Postgres is where it lands when
> we do, without another datastore.
>
> **And the one we didn't plan: row-level security.** It's on all 24 tables now, and it's a real
> second line of defence. The API checks who is asking; the database independently refuses.
> After we found four ways our chat leaked, having a layer that doesn't depend on our own code
> being right mattered.

**Follow-up, and worth volunteering — "what did you lose?"**
> Realtime. Convex gives live updates for free. We replaced it with Supabase Realtime, which
> needed a database client in the browser, which needed a public-read policy on the messages
> table — and that policy turned out to expose every conversation in the app to anyone holding
> the anonymous key, which ships in the JavaScript bundle. We found it in our own security
> review, removed browser database access entirely, and went to seven-second polling. So we lost
> live updates twice over, and we would make that trade again.

### Why not a graph database, given you keep saying "network"?

> **Our traversals are fixed-depth, and joins do fixed-depth well.**
>
> Provider → skills → requests is two hops. Neo4j earns its place when depth is unbounded or
> variable — recommendation over multi-hop social structure, for instance. If we add
> reputation propagation or trust paths, that changes and we'd migrate. Today it would be
> complexity we can't justify.

### Why does the browser never talk to the database?

> **Because that's what made our chat readable by anyone.**
>
> We had a permissive row-level-security policy so a browser-side Supabase client could get live
> updates. But the anonymous key ships inside the JavaScript bundle — so anyone could read every
> message in the app. And RLS genuinely cannot express "only participants" here, because we
> don't use Supabase Auth: to Postgres, every browser caller is the same anonymous role with no
> identity to filter on. So we removed the client entirely and moved the check into the API,
> which knows who's asking. We lost live updates and now poll every seven seconds. That's the
> price and we'd pay it again.

### Why one serverless function instead of one per route?

> **The free tier caps you at twelve, and we had thirty-two routes.**
>
> Vercel creates one function per file under `api/`. We moved every handler into `api/_routes/`
> — underscore directories are excluded from function detection — behind a single `router.ts`
> that maps path to handler. Same public URLs, one function.

### Why phone + OTP and no password?

> **Because the user we're designing for may not read fluently and will not manage a password.**
>
> A phone number is something she already has and already uses. No email, no password reset
> flow, no name asked before verification. We also don't ask her role until after — a first-time
> user answers exactly one question before she's in.

---

## C · Architecture and engineering

**Walk me through the architecture.**
> Browser talks only to `/api/*`, same origin. That hits one serverless function that maps the
> path to one of 42 handlers across 11 feature areas. Shared logic — scoring, geo, skill
> canonicalisation, chat authorisation — sits in a lib layer. Underneath is Supabase Postgres,
> 24 tables, row-level security on all of them. Deployed in Mumbai, continuously from `main`.

**How does the matching score work?**
> Three weighted components: skill fit at 0.5, proximity at 0.3, pay at 0.2. Skill fit is the
> provider's proficiency out of five. Proximity is one over one plus distance in kilometres, so
> it decays smoothly rather than cutting off. Pay is normalised against a ceiling. Fixed weights,
> same inputs, same score.

**Why those weights?**
> Judgement, not tuning — we had no data to tune against. Skill fit dominates because a
> mismatched skill is a failed job; distance matters because travel eats a rural woman's margin;
> pay is a tiebreaker rather than a driver, deliberately, so the system doesn't push everyone at
> the highest-paying job and starve the rest. When we have outcome data these become learnable.

**How do you calculate distance?**
> Haversine over stored coordinates, precomputed into a lookup so a search doesn't recompute per
> row. Honest caveat: locations are currently assigned deterministically rather than captured, so
> the arithmetic is correct over placeholder coordinates. Capturing real location is the next
> item after the pilot.

**What's the skill canonicalisation and why does it matter?**
> Free text resolves in four tiers: exact match, then a curated alias table, then a typo check,
> then it becomes a new skill and gets translated. It matters because without it "sewing",
> "tailoring", "thayyal" and "തയ്യൽ" become four unrelated skills, and a customer searching for
> one finds a quarter of the providers. The marketplace fails quietly.

**Tell me about the "covering / cooking" bug.**
> We matched skills by character similarity. "Covering" scored 0.56 on trigram similarity against
> the alias "catering" and got filed under cooking. Two words differing by two letters aren't
> related — they just look alike. Worse, similarity *missed* real synonyms: "garment finishing"
> and "stitching" share almost no characters. So we split the jobs. Meaning lives in a curated
> table of about 110 phrases across English, Malayalam and Manglish. Similarity was demoted to
> catching typos only, and it has to pass two independent thresholds — 0.7 trigram overlap and a
> normalised edit distance under 0.15. On real cases genuine typos sit around 0.11 and unrelated
> lookalikes at 0.25, so they separate cleanly.

**How did you get 21 seconds down to 1.35?**
> Two causes. The API was resolving relations in JavaScript loops instead of SQL joins — the
> provider directory issued about two queries per provider, so latency scaled with result size.
> We batched those to a fixed number of queries regardless of size. Then we found the function
> was running in Washington while our users enter at the Mumbai edge, so every leg paid a
> transatlantic round trip. Moving the region did the rest.

**Caveat if they press on the number:**
> Those were measured from a high-latency client where a single query costs about a second, so
> the relative improvement — roughly fifteen times — is the meaningful figure rather than the
> absolute.

**How do you know it works?**
> Two layers. A 52-check manual runbook covering every user journey, and 78 automated checks that
> drive the deployed API exactly as the UI does — real accounts through the real OTP flow, no
> mocks, no direct database access. Both pass. The harness is in the repo; you can run it.

**What was the hardest bug?**
> Three deployments that reported success while being completely broken. Green build, "Ready"
> status, dead site. One built nothing in 92 milliseconds because it was building from the wrong
> directory. One hit the function cap and failed *after* the build. One was a catch-all route
> that Vercel builds and then never routes to — we proved that by deploying a static route beside
> it that answered fine. The lesson we kept: a green deployment proves the build ran, not that
> the thing works. That's why our tests run against production.

**What would you do differently?**
> Start on Postgres rather than migrating to it. And test against the deployed URL from day one
> instead of trusting the build status — that one cost us most of a week.

---

## D · Security, privacy, ethics

**What data do you hold on these women?**
> Name, a hashed phone number, skills, capacity, rate, and a location. We never store a raw phone
> number — it's hashed before it's written. No documents, no bank details, no ID.

**Is the hashing secure?**
> It's a fast non-cryptographic hash, which is honest demo-grade, not production-grade. Before a
> real pilot that becomes a salted cryptographic hash. We'd rather say that than claim security
> we don't have.

**Who can read a conversation?**
> Only its participants. We audited this and found four separate ways it leaked, including the
> anonymous key that ships in the browser bundle. All four are closed. A non-participant asking
> for a thread gets a 404, not a 403 — deliberately, so you can't confirm a thread exists by
> probing for it.

**What stops a woman being assigned work she can't do?**
> Capacity is a hard constraint in the assembly — nobody is allocated more units than she
> declared. And nothing reaches her until the customer confirms the team; then she still has to
> accept. Once she's accepted, the customer can't swap her out.

**Could this be used to exploit them — pushing rates down?**
> It's a real risk and we've thought about it, but not solved it. Rates are set by the provider,
> not bid down by customers, which is a deliberate structural choice. What we haven't built is
> fair rotation — right now the highest-rated nearby provider wins repeatedly, and that
> concentrates income. Reputation and rotation signals are on the roadmap for exactly this
> reason.

**What about a woman with no smartphone?**
> Today she can't use it, and that's a real limit. The design intent is that a coordinator or
> another group member operates it on her behalf — which the SHG structure already supports —
> and longer term, an IVR path over a feature phone. We haven't built either.

---

## E · Product and design decisions

**Why Malayalam first, and not English with a translation toggle?**
> Because a default is a statement about who the product is for. English-by-default with a
> language menu says "translated for you". Opening in Malayalam and remembering the choice says
> this was built for you. It also caught a real bug: the font was named in CSS but never actually
> loaded, so Malayalam rendered in whatever face the device happened to have.

**Why text-to-speech but not speech-to-text?**
> Output was achievable with the browser's own engine — no key, no cost, works offline on cheap
> Android. Input needs a real Malayalam ASR service, which needs a key and a budget. We built the
> half we could do properly. It's the top item on our roadmap and we don't pretend otherwise.

**Why does it refuse to speak rather than fall back to an English voice?**
> Malayalam read by an English voice is unintelligible — it isn't degraded output, it's noise.
> And it would look like a broken app rather than an unsupported device. So if there's no
> Malayalam voice we show the text instead.

**Why can the customer swap team members? Doesn't that undermine the algorithm?**
> The algorithm optimises for coverage and proximity. It doesn't know that a customer had a bad
> experience with someone, or that a provider is her neighbour. Giving the customer the final
> edit means the engine advises and the human decides — and it's why providers aren't
> committed until confirmation. Once someone has accepted, she can't be swapped out; only
> someone who declined can be replaced.

**Why is the explanation a template rather than an LLM?**
> Because it's rendered from the logged match record *after* the decision, so it physically
> cannot contradict what the engine did. An LLM writing the explanation could produce a fluent,
> plausible, wrong reason. For a system that intermediates income, that's unacceptable.

**Why polling rather than live updates?**
> We had live updates. They required the browser to hold a database connection, which required
> the permissive policy that made every chat readable. We chose privacy over latency. Seven
> seconds is invisible in a conversation and the trade is worth stating out loud.

---

## F · Scale and future

**Does this scale to a whole state?**
> Matching parallelises by cluster — a team is assembled within a geography, so clusters are
> independent and the work shards naturally. The managed database and serverless functions scale
> before our algorithms do. The real constraint isn't compute, it's onboarding.

**What breaks first at scale?**
> The alias table. It's curated by hand, and 110 phrases across six skills doesn't survive
> fifty skills across five districts. That's where embeddings genuinely earn their place — and
> having the deterministic version first means we'll have labelled data to evaluate them against.

**What's next after the pilot?**
> In order: real location capture, speech input, an admin surface for grievances, and ingesting
> live opportunities from panchayat and enterprise feeds so demand arrives without a customer
> typing it in.

**Could this work outside Kerala?**
> The architecture is network-agnostic — self-help group federations exist in every state. What
> doesn't transfer is the language layer and the alias vocabulary, which is a table of strings
> and a font, so adding Tamil or Kannada is days rather than a rewrite.

---

## G · Team and process

**Who did what?**
> Backend, database, matching engine, API and deployment — Nidhi. Frontend, the Malayalam-first
> interface, all the screens and the integration — Niveditha. Research, requirements, user flows,
> UI/UX planning and the testing that found the defects — Anjana.

**How did you work?**
> 44 commits over the month, everything in one repository with the design documents beside the
> code. Weeks one and two were design and a full backend migration; three and four were
> hardening — security, performance, language. Most of the month's real work doesn't show up as
> a feature.

**What's the honest state of it?**
> Built, deployed, secured and measured — and not yet used by anyone outside the team. We think
> that's the correct order and the next milestone is a real pilot.

---

## H · The awkward ones

**"This looks like a lot for three students. Did you build it?"**
> Yes. It's 44 commits over a month in a public repository with the full history — the migration,
> the deployment failures, the security fixes, all of it. Happy to walk you through any commit
> or any file.

**"Your demo data is fake."**
> It's seeded, yes — 40 provider records written to look like real listings so the screens aren't
> empty. The matching runs on it identically to how it runs on real rows. We say it's seeded
> everywhere in the report rather than implying users we don't have.

**"What if nobody uses it?"**
> Then we've learned something in a pilot with one cluster, which costs a fortnight, rather than
> after building for a year. That's exactly why the next milestone is a pilot and not a feature.

**"Isn't the collective feature over-engineered for the actual need?"**
> It's the reason the project exists. Individual matching is a solved problem with existing
> products. If we drop the collective half, we've built a worse job board. The whole thesis is
> that the income that would change these women's lives is only reachable together.

---

## Pocket card — memorise these six

| | |
|---|---|
| Scale | 42 API routes · 24 tables · ~7,200 lines |
| Speed | **21.0s → 1.35s** on the landing screen |
| Testing | **78 automated checks against production, all passing** |
| Security | 4 chat vulnerabilities found and closed; RLS on all 24 tables |
| Vocabulary | 110 aliases; typos separate at 0.11 vs 0.25 |
| Users | **Zero. Pilot is the next milestone.** |
