import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler } from "../../_lib/http.js";
import { requireSession } from "../../_lib/auth.js";
import { translateText } from "../../_lib/translate.js";

const Body = z.object({
  token: z.string().min(1),
  text: z.string().min(1).max(4000),
  targetLang: z.enum(["en", "ml"]),
});

// A chat message stays in whatever language whoever wrote it typed it in — the app doesn't
// auto-translate the thread, since that would cost a translation call on every message load
// for every reader. This is the on-demand version: whoever's reading it can ask, per message,
// to see (and then hear, via the same ListenButton the rest of the app uses) it in her own
// language. No thread-membership check here beyond a valid session — the caller already read
// this exact text through chat/messages.ts, which already enforced that; translating text
// she's already allowed to see needs no extra authorization of its own.
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, text, targetLang } = Body.parse(req.body);
  await requireSession(token);

  const translated = await translateText(text, targetLang);
  res.status(200).json({ translated });
});
