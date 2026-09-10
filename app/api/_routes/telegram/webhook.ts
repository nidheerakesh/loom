import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../_lib/supabase.js";
import { toE164 } from "../../_lib/sms.js";
import { hashPhone } from "../../_lib/text.js";
import { transcribe, sttConfigured } from "../../_lib/speech.js";
import { providerFor, replyForPhoneHash, CANNOT_HEAR } from "../../_lib/messagingEngine.js";

// Loom over Telegram — a stand-in for WhatsApp during the demo. Meta's review queue is slow
// and WhatsApp Business API costs money to send through; a Telegram bot needs neither, so
// judges can message it live tonight while the real deployment stays WhatsApp
// (whatsapp/webhook.ts). Same commands, same replyFor engine (_lib/messagingEngine.ts) — this
// file is only the adapter, exactly as the comment in that file promised a third channel would be.
//
// The one real difference: Telegram never verifies a phone number the way Meta/Twilio do for
// WhatsApp, so identity isn't free here. A chat proves its number once — typed, matched
// against an existing account the same way sign-in does — and telegram_links (migration 010)
// remembers the mapping so she isn't asked again.

const API = (token: string) => `https://api.telegram.org/bot${token}`;

const ASK_FOR_PHONE = [
  "ലൂം / Loom — ഡെമോ",
  "",
  "തുടരാൻ, രജിസ്റ്റർ ചെയ്ത ഫോൺ നമ്പർ അയയ്ക്കൂ (10 അക്കം).",
  "To continue, send the phone number you registered with (10 digits).",
].join("\n");

const LINK_FAILED = [
  "ആ നമ്പർ ലൂമിൽ കണ്ടെത്താനായില്ല.",
  "",
  "We couldn't find that number registered on Loom. Sign up at loom-lovat-phi.vercel.app first,",
  "then send the same number here.",
].join("\n");

async function sendMessage(token: string, chatId: number | string, text: string): Promise<void> {
  const res = await fetch(`${API(token)}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!res.ok) console.error(`[telegram] sendMessage ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

// Voice notes arrive as a file_id, which — like WhatsApp's media id — has to be exchanged for
// a short-lived URL before the bytes themselves can be fetched. Telegram voice messages are
// OGG/Opus, the same container WhatsApp sends, so the same transcribe() call handles both.
async function transcribeVoice(token: string, fileId: string): Promise<string | null> {
  if (!sttConfigured()) return null;
  try {
    const fileRes = await fetch(`${API(token)}/getFile?file_id=${fileId}`);
    if (!fileRes.ok) {
      console.error(`[telegram] getFile ${fileRes.status}`);
      return null;
    }
    const fileMeta = await fileRes.json();
    const filePath = fileMeta?.result?.file_path;
    if (typeof filePath !== "string") return null;

    const audioRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!audioRes.ok) {
      console.error(`[telegram] file download ${audioRes.status}`);
      return null;
    }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const result = await transcribe(buf, "audio/ogg");
    return result?.text ?? null;
  } catch (e) {
    console.error("[telegram] voice note ", e);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // Never fail loudly at Telegram — it retries a non-2xx, and there is nothing a retry fixes
    // here. Same reasoning whatsapp/webhook.ts's catch-all uses.
    res.status(200).send("ok");
    return;
  }

  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const message = body.message as Record<string, unknown> | undefined;
    const chat = message?.chat as Record<string, unknown> | undefined;
    const chatId = chat?.id;
    if (chatId === undefined || chatId === null) {
      res.status(200).send("ok");
      return;
    }
    const chatIdStr = String(chatId);

    const { data: link, error: linkErr } = await supabaseAdmin
      .from("telegram_links")
      .select("phone_hash")
      .eq("chat_id", chatIdStr)
      .maybeSingle();
    if (linkErr) throw new Error(linkErr.message);

    if (!link) {
      // Not linked yet. Only a message that looks like a phone number attempts a link — a
      // bare "/start" or "hi" just gets asked for one, rather than every stray message
      // triggering a lookup.
      const text = typeof message?.text === "string" ? message.text.trim() : "";
      const digitsOnly = text.replace(/[^\d+]/g, "");
      if (digitsOnly.length >= 10) {
        let e164: string;
        try {
          e164 = toE164(digitsOnly);
        } catch {
          await sendMessage(token, chatIdStr, ASK_FOR_PHONE);
          res.status(200).send("ok");
          return;
        }
        const provider = await providerFor(e164);
        if (!provider) {
          await sendMessage(token, chatIdStr, LINK_FAILED);
          res.status(200).send("ok");
          return;
        }
        const { error: insErr } = await supabaseAdmin
          .from("telegram_links")
          .insert({ chat_id: chatIdStr, phone_hash: hashPhone(e164) });
        if (insErr) throw new Error(insErr.message);

        const reply = await replyForPhoneHash(hashPhone(e164), "");
        await sendMessage(token, chatIdStr, `✓ ${provider.name.split(" ")[0]}, linked.\n\n${reply}`);
        res.status(200).send("ok");
        return;
      }
      await sendMessage(token, chatIdStr, ASK_FOR_PHONE);
      res.status(200).send("ok");
      return;
    }

    // Already linked — same engine WhatsApp uses, just resolved by the stored hash instead of
    // a freshly-verified e164.
    const voice = message?.voice as Record<string, unknown> | undefined;
    if (voice && typeof voice.file_id === "string") {
      const said = await transcribeVoice(token, voice.file_id);
      if (!said) {
        await sendMessage(token, chatIdStr, CANNOT_HEAR);
      } else {
        const reply = await replyForPhoneHash(link.phone_hash, said);
        // Reading back what we heard is not politeness — it is the only way she can catch a
        // mistranscription before it becomes an application for the wrong job.
        await sendMessage(token, chatIdStr, `🎤 "${said}"\n\n${reply}`);
      }
      res.status(200).send("ok");
      return;
    }

    const text = typeof message?.text === "string" ? message.text : "";
    await sendMessage(token, chatIdStr, await replyForPhoneHash(link.phone_hash, text));
    res.status(200).send("ok");
  } catch (e) {
    console.error("[telegram] ", e);
    res.status(200).send("ok");
  }
}
