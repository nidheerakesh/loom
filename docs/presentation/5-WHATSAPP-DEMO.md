# Loom on WhatsApp — demo run script

**Every line below was run against production and the replies are copied verbatim.**

---

## Where this goes in the presentation

**Hold it for Q&A. Do not put it in the nine minutes.**

The talk is rehearsed and full, and this lands far harder as an answer than as a slide. The
question it answers will almost certainly be asked — it is the one your mentor already raised:

> *"Will these women actually be able to use an app?"*
> *"What about someone who isn't comfortable with smartphones?"*
> *"How do you drive adoption?"*

That is the moment. You say: **"We agree, so we didn't make them use the app,"** and then you
show it, live, from your phone.

**Plan B.** If you reach slide 13 and are visibly ahead of time, insert it after Beat 5 of the
demo as a 40-second beat. Cut the second paragraph of slide 10 to pay for it.

---

## Setup — there isn't any

**https://loom-lovat-phi.vercel.app/whatsapp-demo.html**

Open it. That is the whole setup. No Meta app, no Twilio, no dev account, no token that
expires, nothing to configure at the venue.

It is a WhatsApp-shaped window onto the real bot: it posts the exact payload Twilio posts, to
the exact route Meta posts to, and renders the reply. **The engine, the database, the matching
and the Malayalam are all live.** Only the delivery network is simulated — and a banner on the
page says so, because overstating the plumbing would put the honest parts of this project in
doubt for nothing.

Two things it gives you that a real WhatsApp number would not:

- **A sender dropdown.** Identity here *is* the phone number, so switching sender is switching
  person. That makes the identity model visible instead of something you have to assert.
- **No dependency on venue wifi reaching Meta, a 24-hour token, or a recipient allow-list.**

Open it on the presenting laptop *and* on a phone. On a phone it simply looks like WhatsApp.

### If you do want a real number as well

Both paths still work and need no code changes — the handler already speaks Meta's Cloud API and
Twilio. Steps are in git history for `5-WHATSAPP-DEMO.md`, but **do not attempt either the night
before**. The console demonstrates the same claim with none of the risk.

## The conversation — exactly what to type

Rehearse it once. Four messages, and one dropdown change that does the real work.

### 1 · Prove the identity claim

**You type:** `ജോലി`

**It replies:**
```
Lakshmi, 1 ജോലി കണ്ടെത്തി / 1 job found:

1. Blouse stitching
   തയ്യൽ · 3.2 കി.മീ · ₹400

സ്വീകരിക്കാൻ നമ്പർ അയയ്ക്കുക — reply with the number to apply (e.g. 1)
```

**Say:**
> I typed the Malayalam word for "work". Notice it knows who I am — I never logged in. WhatsApp
> has already verified this number, and that's the same number the account is keyed on, so
> there's nothing to log into. No password, no OTP, no app.

*Sender dropdown is set to Lakshmi. The quick-reply chips under the input send these
exact messages, so you never have to type Malayalam on stage.*

### 2 · Apply

**You type:** `1`

**It replies:**
```
✓ "Blouse stitching" — അപേക്ഷിച്ചു.

Applied. This registers interest — the customer chooses who gets the work,
and we'll message you either way.
```

**Say:**
> Applied. And note it says the same thing the app says — applying registers interest, the
> customer still chooses. The rules don't get weaker because you came in through WhatsApp.

### 3 · Show the state

**You type:** `എന്റെ ജോലി`

**It replies:**
```
എന്റെ ജോലി / My work:

• Blouse stitching — waiting for the customer
• 30 school uniform sets — waiting for the customer
```

**Say:**
> Same data as the app, same wording. This is a second front door onto one system, not a second
> product.

### 4 · Switch person — the beat that proves the identity claim

**Change the sender dropdown to `Unregistered number`, then send `ജോലി` again.**

**It replies:**
```
ഈ നമ്പർ ലൂമിൽ രജിസ്റ്റർ ചെയ്തിട്ടില്ല.

This number isn't registered as a provider yet.
Sign up once at loom-lovat-phi.vercel.app, then message here — no password needed.
```

**Say:**
> Same message, different number, completely different answer. The number *is* the account —
> that's why there's nothing to log into, and why a stranger can't read someone else's work.

### 5 · Close the point

**Say, without typing anything:**
> There's deliberately no language model in this. Replies are templates over the same
> deterministic engine — because a hallucination here means somebody doesn't get paid.
>
> And it needs no session storage: the ranking is deterministic, so "reply 1" recomputes the
> same list rather than remembering what it offered.

---

## What it does when things go wrong — all tested

| You send | It replies |
|---|---|
| `hello`, or anything unrecognised | The two-command menu. It never guesses. |
| `9` when only one job is listed | *"There is no job 9 right now"*, then re-lists what there is |
| `1` twice | *"You have already applied… Waiting for the customer."* |
| From an unregistered number | *"This number isn't registered as a provider yet"* + where to sign up |

If a judge tries to break it by typing nonsense, that is a **good** outcome — it answers
plainly instead of inventing. Let them.

---

## If it fails on the day

The console needs the Loom API, which is the same thing the rest of the demo needs — if that is
down you have larger problems. As a second layer, the terminal simulator needs no browser:

```bash
cd app && node scripts/whatsapp-test.mjs "ജോലി" "1" "എന്റെ ജോലി"
```

It posts exactly what Twilio posts and prints the replies in your terminal. It proves the bot
works even with no phone signal in the room. Screenshot its output tonight as a slide too.

Do **not** spend stage time debugging a sandbox. One attempt, then switch to the terminal or the
screenshot and keep talking.

---

## What to say if asked why not the official WhatsApp Business API

> What you're seeing is the real handler and the real engine — we simulated the transport so the
> demo doesn't depend on a conference network reaching Meta. The code already speaks both Meta's
> Cloud API and Twilio; we've tested both payload shapes against this endpoint. Production is a
> verified business number, which is Meta paperwork rather than engineering. The handler doesn't
> change — only the number it hangs off does.

---

## Test data note

Running this demo writes one `interests` row per job you apply to. It shows up in that
customer's applicant list.

**The morning reseed clears it** — which is one more reason step A of the prototype plan is not
optional. Run `npm run seed` after any rehearsal, and again before you present.
