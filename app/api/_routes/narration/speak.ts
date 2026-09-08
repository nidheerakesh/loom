import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler } from "../../_lib/http.js";
import { requireSession } from "../../_lib/auth.js";
import { synthesize, ttsConfigured } from "../../_lib/speech.js";

// Spoken Malayalam that does not depend on the device having a Malayalam voice.
//
// Speech has always worked through the browser's own engine — no key, no cost, and it runs on
// the cheap Android phones this is built for. But it only speaks a language the device has
// installed, and on a laptop, or a phone without the Malayalam pack, the app correctly refuses
// rather than reading Malayalam in an English accent. Correct, and it means the headline
// accessibility feature is invisible to whoever happens to be holding the wrong device.
//
// So the server can now synthesise it instead. This is strictly an upgrade path: with no key
// the route says so and the client keeps using the device voice exactly as before.
const Body = z.object({
  token: z.string().min(1),
  text: z.string().min(1).max(2000),
  lang: z.enum(["ml", "en"]).default("ml"),
});

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, text, lang } = Body.parse(req.body);
  await requireSession(token);

  // "No key configured" and "the key is configured and the call failed" are different
  // problems with the same symptom, and telling them apart from outside was impossible —
  // which turned a five-minute misconfiguration into guesswork. The reason is only ever shown
  // to a signed-in caller and never contains the key.
  if (!ttsConfigured()) {
    // 200, not an error: no server voice is an ordinary state, and the client has a working
    // fallback. Failing here would make the button look broken when it is not.
    res.status(200).json({ available: false, reason: "not-configured" });
    return;
  }

  const clip = await synthesize(text, lang);
  if (!clip) {
    res.status(200).json({ available: false, reason: "provider-failed" });
    return;
  }

  res.status(200).json({ available: true, audio: clip.audioBase64, mime: clip.mime, source: clip.source });
});
