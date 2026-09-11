import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { withHandler } from "../../_lib/http.js";
import { requireSession } from "../../_lib/auth.js";
import { resolveOrCreateSkill } from "../../_lib/skillResolve.js";

const Body = z.object({ token: z.string().min(1), phrase: z.string().min(1) });

// A customer posting a job needs the same "sewing" / "thayyal" / a typo all landing on one
// skill that a provider's own skill entry gets — skills/list.ts only offers what already
// exists, which left no way to ask for work under a skill nobody's typed yet. Any signed-in
// role may call this (unlike skills/resolve.ts, which is provider-only because it also
// assigns the result to the caller's own profile — this route never assigns anything, it just
// resolves or creates the skill row and hands back its id).
export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  const { token, phrase } = Body.parse(req.body);
  await requireSession(token);

  const resolved = await resolveOrCreateSkill(phrase);
  res.status(200).json({
    skillId: resolved.skillId,
    canonicalName: resolved.canonicalName,
    canonicalNameMl: resolved.canonicalNameMl,
    matchedVia: resolved.matchedVia,
  });
});
