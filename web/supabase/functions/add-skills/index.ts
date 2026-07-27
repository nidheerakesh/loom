import { serviceClient, getUser, json, cors, normalize, similarity, SKILL_MERGE_THRESHOLD } from "../_shared/util.ts";
import { translateSkill } from "../_shared/translate.ts";

// Deterministic merge to existing skills; genuinely-new skills are LLM/API-translated and
// created so every skill is usable app-wide. LLM only labels a node, never decides a match.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await getUser(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { phrases } = await req.json();
  if (!Array.isArray(phrases)) return json({ error: "phrases required" }, 400);
  const db = serviceClient();

  const { data: provider } = await db.from("providers").select("id").eq("user_id", user.id).maybeSingle();
  if (!provider) return json({ error: "no provider profile" }, 400);

  const { data: skills } = await db.from("skills").select("id,canonical_name,canonical_name_ml");
  const { data: aliases } = await db.from("skill_aliases").select("skill_id,alias_text");
  const skillList = skills ?? [];
  const aliasList = aliases ?? [];

  const readback: unknown[] = [];
  const chosen = new Set<string>();

  for (const phrase of phrases) {
    if (!phrase?.trim()) continue;
    const norm = normalize(phrase);

    // exact
    let hit = skillList.find((s) => normalize(s.canonical_name) === norm || normalize(s.canonical_name_ml ?? "") === norm);
    let via = "exact";
    // alias
    if (!hit) {
      const a = aliasList.find((x) => x.alias_text === norm);
      if (a) { hit = skillList.find((s) => s.id === a.skill_id); via = "alias"; }
    }
    // similarity
    if (!hit) {
      let best: { s: typeof skillList[number]; score: number } | null = null;
      for (const s of skillList) {
        let sc = Math.max(similarity(norm, s.canonical_name), s.canonical_name_ml ? similarity(norm, s.canonical_name_ml) : 0);
        for (const a of aliasList) if (a.skill_id === s.id) sc = Math.max(sc, similarity(norm, a.alias_text));
        if (!best || sc > best.score) best = { s, score: sc };
      }
      if (best && best.score >= SKILL_MERGE_THRESHOLD) { hit = best.s; via = "similarity"; }
    }
    // create via translation
    if (!hit) {
      const t = await translateSkill(phrase);
      const { data: created } = await db.from("skills")
        .upsert({ canonical_name: t.en, canonical_name_ml: t.ml, icon_key: t.emoji }, { onConflict: "canonical_name" })
        .select("id,canonical_name,canonical_name_ml").single();
      if (created) {
        await db.from("skill_aliases").insert({ skill_id: created.id, alias_text: norm, source: "approved" });
        skillList.push(created);
        hit = created;
        via = "created";
      }
    }
    if (hit) {
      chosen.add(hit.id);
      readback.push({ raw: phrase, canonicalName: hit.canonical_name, canonicalNameMl: hit.canonical_name_ml, matchedVia: via });
    }
  }

  // replace provider_skills with chosen set
  const { data: existing } = await db.from("provider_skills").select("id,skill_id").eq("provider_id", provider.id);
  const keep = new Set(chosen);
  for (const row of existing ?? []) {
    if (keep.has(row.skill_id)) keep.delete(row.skill_id);
    else await db.from("provider_skills").delete().eq("id", row.id);
  }
  for (const skillId of keep) {
    await db.from("provider_skills").insert({ provider_id: provider.id, skill_id: skillId, proficiency: 3 });
  }

  return json({ readback });
});
