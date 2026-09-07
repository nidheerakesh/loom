# Real WhatsApp, free — Meta Cloud API test number

~20 minutes, ₹0. The code is already deployed and already speaks Meta's payload shape; all of
this is console work.

**Why it stays free:** service conversations are free and unlimited — any reply sent inside the
24-hour window that opens when *she* messages you first costs nothing, and the Cloud API has no
platform fee. Loom's bot only ever replies, so it never leaves that window. Proactive
notifications would be paid; nothing built today sends one.

---

## 0 · Register your own number as a provider first

The bot identifies a woman *by* her number, so if yours is not in the database it will
correctly refuse you. On the live app: sign up with your own number as a **provider**, add the
skill `stitching`, set a rate.

Re-do this after any `npm run seed`, which deletes it.

---

## 1 · Create the app

[developers.facebook.com](https://developers.facebook.com) → **Create App** → type **Business**
→ add the **WhatsApp** product.

**WhatsApp → API Setup** now shows a free test number, and a **Phone number ID** under *From*.
Keep that page open.

## 2 · Add yourself as a recipient

Same page, under **To** → add your own WhatsApp number → verify the code it sends.

**A test number can only message numbers you have added here** — up to five. Skip this and
nothing will ever arrive, with no error to tell you why.

## 3 · Get a permanent token

The token at the top of the API Setup page **expires in 24 hours**. Do not use it. Instead:

**Business Settings → Users → System Users → Add**
→ name it anything, role **Admin**
→ **Add Assets** → your app → toggle **Manage**
→ **Generate new token** → select your app → tick `whatsapp_business_messaging`
→ **Token expiration: Never**

Copy it. This is the difference between configuring once and reconfiguring every morning.

## 4 · Vercel environment variables — before touching the webhook

```
WHATSAPP_TOKEN            = <the permanent token from step 3>
WHATSAPP_PHONE_NUMBER_ID  = <Phone number ID from step 1>
WHATSAPP_VERIFY_TOKEN     = loom-verify-2026
```

The last one is any string you invent; you retype it in step 6.

**Order matters.** Meta verifies by calling the webhook, which compares against
`WHATSAPP_VERIFY_TOKEN`. Configure Meta before this exists and it fails with an unhelpful
error.

Environment variables need a redeploy to take effect:

```bash
cd ~/Loom && git commit --allow-empty -m "Redeploy for WhatsApp env vars" && git push
```

## 5 · Checkpoint — prove it before Meta sees it

```bash
curl "https://loom-lovat-phi.vercel.app/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=loom-verify-2026&hub.challenge=hello"
```

Must print exactly `hello`.

Prints `Verification failed`? The env var is not live — the redeploy has not finished, or the
string does not match. **Fix it here.** Meta's console gives a useless error for the same cause,
so debugging it there wastes time.

## 6 · Point Meta at the webhook

**WhatsApp → Configuration → Webhook → Edit**

- Callback URL: `https://loom-lovat-phi.vercel.app/api/whatsapp/webhook`
- Verify token: `loom-verify-2026` — character for character

**Verify and save** goes green instantly, because step 5 already proved it.

## 7 · The step everyone misses

**Manage → subscribe to the `messages` field.**

Without it the webhook is verified and receives nothing — which looks exactly like broken code.

## 8 · Send a message

WhatsApp **`ജോലി`** to the test number, from the number you registered in step 0.

It should greet you **by name** and list work.

---

## If it goes wrong

| Symptom | Cause |
|---|---|
| Console verification fails but the curl works | Token string mismatch. Retype both, no trailing space |
| Verified, but messages get no reply | Step 7 — not subscribed to `messages` |
| *"This number isn't registered as a provider"* | Correct behaviour. Step 0 |
| Nothing arrives at all, no error | Your number is not in the **To** list from step 2 |
| Worked yesterday, silent today | You used the 24-hour token. Step 3 |

The handler answers `200` to everything Meta sends, including delivery receipts and malformed
payloads, so Meta will never retry-storm you. If replies stop, it is configuration, not code —
all three payload shapes are covered by the test suite.

---

## Testing without any of this

Still the fastest loop, and unaffected by everything above:

```
https://loom-lovat-phi.vercel.app/whatsapp-demo.html
cd app && node scripts/whatsapp-test.mjs "ജോലി" "1" "ടീം"
```
