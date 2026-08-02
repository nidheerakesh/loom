// LLM translation for NEW skills only (en↔ml + an emoji). Ported from
// convex/lib/translate.ts — logic unchanged, only the env-var source moves from Convex
// env to Vercel env. Preference order:
//   npx vercel env add NVIDIA_API_KEY      (NVIDIA NIM, preferred)
//   npx vercel env add ANTHROPIC_API_KEY
//   npx vercel env add GEMINI_API_KEY
// Optional: NVIDIA_MODEL (default meta/llama-3.3-70b-instruct).
// If no key is set, falls back to a deterministic echo so the app still works offline.

export type Translation = { en: string; ml: string; emoji: string };

const PROMPT = (phrase: string) =>
  `You label skills for a women's livelihood app in Kerala. For the skill "${phrase}", return ONLY compact JSON: {"en":"<short English canonical name, lowercase>","ml":"<Malayalam translation>","emoji":"<a single emoji>"}. No prose.`;

function parseJson(text: string): Translation | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (typeof o.en === "string" && typeof o.ml === "string") {
      return { en: o.en.trim().toLowerCase(), ml: String(o.ml).trim(), emoji: typeof o.emoji === "string" && o.emoji ? o.emoji : "🛠️" };
    }
  } catch {
    /* ignore */
  }
  return null;
}

// NVIDIA NIM — OpenAI-compatible chat completions.
async function viaNvidia(phrase: string, key: string): Promise<Translation | null> {
  const model = process.env.NVIDIA_MODEL ?? "meta/llama-3.3-70b-instruct";
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      temperature: 0.2,
      messages: [{ role: "user", content: PROMPT(phrase) }],
    }),
  });
  if (!res.ok) {
    console.error(`[nim] ${res.status} model=${model}: ${(await res.text()).slice(0, 300)}`);
    return null;
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  const parsed = typeof text === "string" ? parseJson(text) : null;
  if (!parsed) console.error(`[nim] unparseable response: ${JSON.stringify(text).slice(0, 300)}`);
  return parsed;
}

async function viaAnthropic(phrase: string, key: string): Promise<Translation | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: PROMPT(phrase) }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  return typeof text === "string" ? parseJson(text) : null;
}

async function viaGemini(phrase: string, key: string): Promise<Translation | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT(phrase) }] }] }),
    },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" ? parseJson(text) : null;
}

// Detects whether the phrase already contains Malayalam characters.
function hasMalayalam(s: string): boolean {
  return /[ഀ-ൿ]/.test(s);
}

// Keyless en↔ml translation via MyMemory (free, rate-limited). No emoji.
async function viaMyMemory(text: string, source: string, target: string): Promise<string | null> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[mymemory] ${res.status}`);
    return null;
  }
  const data = await res.json();
  const t = data?.responseData?.translatedText;
  return typeof t === "string" && t.trim() ? t.trim() : null;
}

// Rough emoji for a skill (best-effort; not critical).
function guessEmoji(en: string): string {
  const map: [RegExp, string][] = [
    [/stitch|tailor|sew|garment|embroider/, "🧵"],
    [/cut/, "✂️"],
    [/pack|box|wrap/, "📦"],
    [/cook|cater|food|bak|pickle/, "🍲"],
    [/craft|art|paint|pottery|clay|weav/, "🎨"],
    [/tutor|teach|coach/, "📚"],
    [/bee|honey|farm|garden|agri/, "🐝"],
    [/clean|wash/, "🧹"],
    [/beaut|salon|hair|mehendi|henna/, "💅"],
  ];
  for (const [re, e] of map) if (re.test(en)) return e;
  return "🛠️";
}

export async function translateSkill(phrase: string): Promise<Translation> {
  const clean = phrase.trim();
  const lower = clean.toLowerCase();
  const nvidia = process.env.NVIDIA_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  try {
    // 1. LLM providers (also produce an emoji) — used only if a key is set.
    if (nvidia) {
      const t = await viaNvidia(clean, nvidia);
      if (t) return t;
    }
    if (anthropic) {
      const t = await viaAnthropic(clean, anthropic);
      if (t) return t;
    }
    if (gemini) {
      const t = await viaGemini(clean, gemini);
      if (t) return t;
    }
    // 2. Keyless translation API (no LLM, no key).
    const src = hasMalayalam(clean) ? "ml" : "en";
    const tgt = src === "ml" ? "en" : "ml";
    const translated = await viaMyMemory(clean, src, tgt);
    if (translated) {
      const en = src === "en" ? lower : translated.toLowerCase();
      const ml = src === "ml" ? clean : translated;
      return { en, ml, emoji: guessEmoji(en) };
    }
  } catch (e) {
    console.error(`[translate] ${String(e)}`);
  }
  // 3. Offline fallback: keep the phrase as-is.
  return { en: lower, ml: clean, emoji: guessEmoji(lower) };
}
