import type { VercelRequest, VercelResponse } from "@vercel/node";
import { toE164 } from "../../_lib/sms.js";
import { transcribe, sttConfigured } from "../../_lib/speech.js";
import { replyFor, CANNOT_HEAR } from "../../_lib/messagingEngine.js";

// Loom over WhatsApp.
//
// The app assumes a woman can install it, read a tab bar and navigate. Many of the women this
// is built for already do all their messaging in WhatsApp and nothing else — so this exposes
// the two things that matter, finding work and taking it, where she already is.
//
// Identity comes free. WhatsApp has already verified the sender's number, and accounts are
// keyed on `hashPhone(e164)` — the same hash auth/request-otp computes — so a message
// resolves to a provider with no OTP, no password and no session.
//
// Two networks, one engine. Meta's Cloud API and Twilio deliver completely different payloads
// and expect replies by different means, so each gets a thin adapter and `replyFor`
// (_lib/messagingEngine.ts, shared with telegram/webhook.ts) knows about neither. Adding a
// third channel is another adapter, not another product — which is exactly what happened when
// Telegram was added for the demo, rather than waiting on Meta's review queue.
//
// No language model: replies are templates over the same deterministic engine the app uses,
// because a hallucination here means somebody does not get paid.

const GRAPH = "https://graph.facebook.com/v21.0";

function twiml(message: string): string {
  const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
}

// Twilio sends "whatsapp:+919876530001"; Meta sends a bare "919876530001". toE164 normalises
// both to the +91 form the account hash is built from.
function senderNumber(from: string): string | null {
  const raw = from.replace(/^whatsapp:/i, "").trim();
  try {
    return toE164(raw);
  } catch {
    return null;
  }
}

// A voice note is how a woman who does not type actually communicates, so the channel that
// exists to remove the app is not much use if it only accepts text. WhatsApp sends audio as a
// media id, which has to be exchanged for a short-lived URL and then downloaded with the same
// token.
async function transcribeVoiceNote(mediaId: string): Promise<string | null> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token || !sttConfigured()) return null;

  try {
    const metaRes = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) {
      console.error(`[whatsapp] media lookup ${metaRes.status}`);
      return null;
    }
    const meta = await metaRes.json();
    if (typeof meta?.url !== "string") return null;

    // The media URL is on a Meta CDN and still requires the token — fetching it unauthenticated
    // returns a 401 that looks like an expired media id.
    const audioRes = await fetch(meta.url, { headers: { authorization: `Bearer ${token}` } });
    if (!audioRes.ok) {
      console.error(`[whatsapp] media download ${audioRes.status}`);
      return null;
    }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const result = await transcribe(buf, typeof meta.mime_type === "string" ? meta.mime_type : "audio/ogg");
    return result?.text ?? null;
  } catch (e) {
    console.error("[whatsapp] voice note ", e);
    return null;
  }
}

async function sendViaMeta(to: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.error("[whatsapp] WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID not set");
    return;
  }
  const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body },
    }),
  });
  if (!res.ok) console.error(`[whatsapp] send ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Meta verifies ownership of the webhook by calling it with a challenge to echo back.
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(String(challenge ?? ""));
      return;
    }
    res.status(403).send("Verification failed");
    return;
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    // --- Meta Cloud API ---------------------------------------------------------------
    if (Array.isArray(body.entry)) {
      const value = body.entry[0]?.changes?.[0]?.value;
      const msg = value?.messages?.[0];
      // Delivery receipts and read receipts arrive here too and must be acknowledged silently.
      if (typeof msg?.from === "string" && (msg.type === "text" || msg.type === "audio")) {
        const e164 = senderNumber(msg.from);
        if (e164) {
          const said: string | null =
            msg.type === "text" ? String(msg.text?.body ?? "") : await transcribeVoiceNote(String(msg.audio?.id ?? ""));

          // Transcription that failed must not be treated as an empty message, which would
          // silently answer with the menu and leave her thinking she was understood.
          if (msg.type === "audio" && !said) {
            await sendViaMeta(msg.from, CANNOT_HEAR);
          } else {
            const reply = await replyFor(e164, said ?? "");
            // Reading back what we heard is not politeness — it is the only way she can catch a
            // mistranscription before it becomes an application for the wrong job.
            await sendViaMeta(
              msg.from,
              msg.type === "audio" ? `🎤 "${said}"\n\n${reply}` : reply,
            );
          }
        }
      }
      res.status(200).send("ok");
      return;
    }

    // --- Twilio -----------------------------------------------------------------------
    res.setHeader("content-type", "text/xml; charset=utf-8");
    const from = typeof body.From === "string" ? body.From : "";
    const e164 = senderNumber(from);
    if (!e164) {
      res.status(200).send(twiml("Could not read your number. Message us from WhatsApp."));
      return;
    }
    res.status(200).send(twiml(await replyFor(e164, String(body.Body ?? ""))));
  } catch (e) {
    console.error("[whatsapp] ", e);
    // Never fail at the provider — an error status makes it retry and the sender sees nothing.
    if (Array.isArray(req.body?.entry)) res.status(200).send("ok");
    else res.status(200).send(twiml("Something went wrong at our end. Please try again in a moment."));
  }
}
