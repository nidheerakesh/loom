import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler, HttpError } from "../../_lib/http.js";
import { requireSession } from "../../_lib/auth.js";
import { transcribe, sttConfigured } from "../../_lib/speech.js";

// Speech to text for the app, alongside the WhatsApp path.
//
// The voice-first goal has always been half met: the app could speak but not listen, so a woman
// who cannot read fluently could hear her matches and still had to type her skills. This is the
// other half — she records, and the words come back for her to confirm.
//
// Confirmation is not optional here. The transcript feeds skill entry, and a skill she never
// said becomes part of the shared vocabulary: it is how "covering" ended up meaning cooking
// once already, from a different direction. So this route only ever returns text. Deciding
// what to do with it stays with her.
const Body = z.object({
  token: z.string().min(1),
  // Base64 audio. Serverless request bodies are capped around 4.5MB and a voice note is a
  // few tens of kilobytes, so this ceiling is generous and still refuses a file upload.
  audio: z.string().min(1).max(3_000_000),
  mime: z.string().min(1).max(80).default("audio/webm"),
  lang: z.enum(["ml", "en"]).default("ml"),
});

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, audio, mime, lang } = Body.parse(req.body);
  await requireSession(token);

  if (!sttConfigured()) {
    res.status(200).json({ available: false, reason: "not-configured" });
    return;
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(audio, "base64");
  } catch {
    throw new HttpError(400, "Could not read that audio");
  }
  if (buf.length === 0) throw new HttpError(400, "Empty audio");

  const result = await transcribe(buf, mime, lang);
  if (!result) {
    // Not an error status: a recording that could not be understood is an ordinary outcome,
    // and the caller should offer typing rather than show a failure.
    res.status(200).json({ available: false, reason: "provider-failed" });
    return;
  }

  res.status(200).json({ available: true, text: result.text, source: result.source });
});
