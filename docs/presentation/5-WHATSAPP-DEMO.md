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

## Setup

The bot speaks two networks. Use whichever is working on the day — the conversation and the
replies are identical either way, because both adapters call the same engine.

### Option A · Meta Cloud API — a real WhatsApp number, no join code

Better for a demo: judges can message it without sending a join code first.

**Do this tonight, not in the morning.** Meta's temporary token lasts 24 hours, so one generated
tonight is still valid through tomorrow's slot — and doing it now leaves time to debug a console
that does not cooperate. Generating it in the morning buys nothing and risks doing Meta's
onboarding under time pressure.

1. **developers.facebook.com** → Create App → type **Business** → add the **WhatsApp** product.
2. **WhatsApp → API Setup** gives you three things:

   | Value | Where on the page |
   |---|---|
   | Temporary access token | top of the page → `WHATSAPP_TOKEN` |
   | Phone number ID | under "From" → `WHATSAPP_PHONE_NUMBER_ID` |
   | Test number | Meta provides it free |

3. Still on that page, under **To**, add your own phone as a recipient and verify the code.
   **A test number can only message numbers you have added.**
4. **Vercel → Settings → Environment Variables**, add three. **Order matters: do this before
   step 5.** Meta verifies by calling the webhook, and the webhook compares against
   `WHATSAPP_VERIFY_TOKEN` — if it is not set yet, verification fails and the console shows an
   unhelpful error. Environment variables need a **redeploy** to take effect:
   ```
   WHATSAPP_TOKEN            = <temporary access token>
   WHATSAPP_PHONE_NUMBER_ID  = <phone number ID>
   WHATSAPP_VERIFY_TOKEN     = loom-verify-2026     ← any string; you retype it in step 5
   ```
5. **WhatsApp → Configuration → Webhook → Edit**
   - Callback URL: `https://loom-lovat-phi.vercel.app/api/whatsapp/webhook`
   - Verify token: `loom-verify-2026` — must match exactly
   - **Verify and save** should go green immediately.
6. **Manage → subscribe to the `messages` field.** Easy to miss, and nothing arrives without it.

Check the verification endpoint yourself before touching the console:

```bash
curl "https://loom-lovat-phi.vercel.app/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=loom-verify-2026&hub.challenge=hello"
# expect: hello
```

A wrong token returns `403 Verification failed` — that is the check working, not a fault.

### Option B · Twilio sandbox — faster, but needs a join code

1. Twilio Console → **Messaging → Try it out → Send a WhatsApp message**
2. Sandbox settings → **When a message comes in**:
   `https://loom-lovat-phi.vercel.app/api/whatsapp/webhook` · **HTTP POST**
3. From your demo phone, WhatsApp **`join <your-sandbox-code>`** to **+1 415 523 8886**

### Either way: the phone you demo from must be a registered provider

Loom identifies a provider **by** her number, so if yours isn't in the database the bot will
correctly tell you it isn't registered.

**One minute to fix:** sign up on the live app with your own number as a **provider**, add the
skill `stitching`, set a rate. **Re-do it after the morning reseed**, which deletes it.

## The conversation — exactly what to type

Rehearse it once. It is four messages.

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

*(Use whatever name it returns — it will be yours, not Lakshmi's.)*

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

### 4 · Close the point

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

## If WhatsApp fails on the day

The sandbox depends on Twilio, your signal, and the venue's network. Have this ready:

```bash
cd app && node scripts/whatsapp-test.mjs "ജോലി" "1" "എന്റെ ജോലി"
```

It posts exactly what Twilio posts and prints the replies in your terminal. It proves the bot
works even with no phone signal in the room. Screenshot its output tonight as a slide too.

Do **not** spend stage time debugging a sandbox. One attempt, then switch to the terminal or the
screenshot and keep talking.

---

## What to say if asked why not the official WhatsApp Business API

> The sandbox is a Twilio number, so it needs a join code — fine for a demo, not for a
> grandmother. Production would be WhatsApp Business Cloud API with a verified business number,
> which needs Meta business verification and takes days. The webhook we wrote doesn't change:
> same handler, same identity model. What changes is the number it hangs off.

---

## Test data note

Running this demo writes one `interests` row per job you apply to. It shows up in that
customer's applicant list.

**The morning reseed clears it** — which is one more reason step A of the prototype plan is not
optional. Run `npm run seed` after any rehearsal, and again before you present.
