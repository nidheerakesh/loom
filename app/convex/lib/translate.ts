// LLM translation for NEW skills only (en↔ml + an emoji). Runs inside a Convex action
// (fetch allowed). Reads API keys from Convex env (never hardcode). Preference order:
//   npx convex env set NVIDIA_API_KEY nvapi-...      (NVIDIA NIM, preferred)
//   npx convex env set ANTHROPIC_API_KEY sk-...
//   npx convex env set GEMINI_API_KEY ...
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
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === "string" ? parseJson(text) : null;
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

export async function translateSkill(phrase: string): Promise<Translation> {
  const clean = phrase.trim();
  const nvidia = process.env.NVIDIA_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  try {
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
  } catch {
    /* fall through to offline fallback */
  }
  // Offline fallback: keep the phrase; mirror across languages as best we can.
  const lower = clean.toLowerCase();
  return hasMalayalam(clean)
    ? { en: lower, ml: clean, emoji: "🛠️" }
    : { en: lower, ml: clean, emoji: "🛠️" };
}
