# The live demo — three phones and a laptop

Three phones is not a luxury here. The claim is that Loom assembles a team **across different
self-help groups**, and three phones let you prove that physically: at the moment the customer
confirms, three handsets in three different SHGs light up at once. Nobody argues with that.

---

## Who holds what

| Device | Signed in as | Phone number | Group |
|---|---|---|---|
| **Laptop** — projected | **Sr. Alphonsa**, the customer | `9876540002` | — |
| **Phone A** | Sheeba Thomas, provider | `9876530006` | **SHG 6** · 5 units |
| **Phone B** | Sumangala Pillai, provider | `9876530038` | **SHG 2** · 3 units |
| **Phone C** | Fathima Beevi, provider | `9876530005` | **SHG 5** · 1 unit |

Three providers, three different groups, different unit counts. That is the whole argument in
one glance.

**Hands.** Speaker drives the laptop. Teammate 1 holds phones A and B, one in each hand.
Teammate 2 holds phone C and, in Q&A, switches it to the WhatsApp console. If holding two phones
feels awkward, prop A and B against something facing the audience — they only need to be
*visible* at the confirm moment.

---

## Pre-flight

### The night before

```bash
cd app
npm run seed                     # clean state, same phone numbers
node scripts/demo-preflight.mjs  # verifies every device account + the headline order
```

`demo-preflight.mjs` is read-only — it never assembles a team, because assembling moves the
30-uniform order out of `open` and no route puts it back. It checks the site responds, every
account above signs in, the order exists and is still `open`, and the WhatsApp console answers
in Malayalam.

### Ten minutes before you present

1. **Reseed one last time.** `cd app && npm run seed`
2. **Re-run the pre-flight.** Every line must be `✓`. If *"…and is still `open`"* fails, someone
   assembled the team during rehearsal — reseed again.
3. **Sign in on all four devices.** Sessions live in the browser, so do this after the reseed —
   the reseed signs everyone out.
4. **On every phone:**
   - **Screen timeout → 5 minutes or Never.** A phone that sleeps mid-demo is the single most
     likely failure on this page.
   - **Do Not Disturb on.** A WhatsApp notification over the demo is a bad look.
   - Brightness to maximum.
   - Open the app to **My work** and leave it there.
5. **On the laptop:** two tabs — the app signed in as Sr. Alphonsa, and
   `loom-lovat-phi.vercel.app/whatsapp-demo.html` for Q&A. Close everything else.
6. Hotspot on, all four devices joined, and load the app once over it.

---

## The demo, beat by beat

Three minutes. This replaces Beat 3 and Beat 4 of `2-SCRIPT.md`; Beats 1, 2 and 5 are unchanged.

### Beat 3 · The order nobody can take alone — 40s

*Laptop, projected. Sr. Alphonsa's request list.*

> This is a school needing thirty uniform sets — cutting, stitching and packaging. Three
> different skills, and thirty units. There is no single woman in this district who can take it.

*Tap **Assemble team**. Say nothing while it renders.*

> Eighteen providers, across six different self-help groups. Coverage complete.

*Read the app's own rationale off the screen, then scroll the member list slowly.*

> It's telling me its reasoning, not just its answer. And look at the group column — these women
> are in different groups. They may never have met. That is the thing a job board cannot
> represent, because a job board matches one person to one listing.

### Beat 4 · Nothing is committed yet — 30s

*Teammates hold up all three phones, screens out.*

> Now look at the three phones. These are three of the women on that team, and every one of
> their screens is empty. The team is still the customer's draft — nobody has been told
> anything.

*Laptop: tap **Replace** on one member, show the alternatives, close it without swapping.*

> The customer can still swap anyone. The engine advises; the human decides.

### Beat 5 · Three phones, at once — 40s

*Laptop: tap **Confirm team**.*

> Now I confirm.

*Count to five out loud in your head. The phones poll every seven seconds.*

*When they land:*

> Three phones, three different self-help groups, one order. **And it's an invitation, not an
> assignment** — each of them still has to accept. Nobody is given work she didn't agree to.

*Teammate on phone A taps **Accept**.*

> She's in. And now that she's accepted, the customer can no longer swap her out — only someone
> who declined can be replaced.

**This is the moment the pitch is won.** Do not rush it, and do not talk over the seven seconds.
If the silence feels long, say *"the phones poll every few seconds — there they are."*

---

## When something goes wrong

| What happens | Do this |
|---|---|
| A phone slept and shows the lock screen | Ignore it. Two phones lighting up makes the same point. Do not stop to unlock. |
| Invitations take longer than 7s | *"They poll every few seconds."* Keep talking. They will arrive. |
| A phone shows nothing after 20s | Pull-to-refresh on that phone. If still nothing, carry on with the others. |
| The Assemble tap does nothing | The order is probably not `open` — someone assembled it already. Say *"we've already assembled this one, here's the result"* and show the existing team. The claim is unharmed. |
| Wifi dies entirely | Switch to the recorded video without narrating the failure. Say *"here it is running."* |

**Never debug on stage.** Every failure above has a sentence that keeps the demo moving. Judges
forgive a network; they remember a team that froze.

---

## In Q&A — phone C becomes WhatsApp

When someone asks whether these women can really use an app, teammate 2 switches phone C to
`loom-lovat-phi.vercel.app/whatsapp-demo.html` and hands it over or holds it up. Full script in
`5-WHATSAPP-DEMO.md`.

> We agree — so we didn't make them use the app.

---

## Rehearse this specific choreography once

Not the app: **the handoff**. Who holds which phone, when they raise them, who taps Accept. Do it
once end to end with all four devices in your hands. It takes four minutes and it is the
difference between a demo that looks rehearsed and one that looks like three people fumbling
with phones.

Then reseed, because rehearsing assembles the team.
