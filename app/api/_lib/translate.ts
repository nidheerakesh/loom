// Translation for NEW skills only (en↔ml). Preference order:
//   BHASHINI_API_KEY + BHASHINI_USER_ID   (preferred — see below)
//   NVIDIA_API_KEY                        (NVIDIA NIM)
//   ANTHROPIC_API_KEY
//   GEMINI_API_KEY
// Optional: NVIDIA_MODEL (default meta/llama-3.3-70b-instruct), BHASHINI_PIPELINE_ID.
// With no key at all, falls back to a deterministic echo so the app still works offline.
//
// Bhashini leads because it is the Government of India's translation service, built and
// tuned for Indic languages; general-purpose LLMs are noticeably weaker at Malayalam,
// especially on domain vocabulary like garment and craft terms. docs/TDD.md §4 names it.
//
// The previous keyless step, MyMemory, was removed: its Malayalam output was poor enough
// that a wrong canonical name could enter the shared skill taxonomy, which then silently
// mis-groups every provider who types that phrase. Echoing the phrase unchanged is a better
// failure than confidently translating it wrong.

export type Translation = { en: string; ml: string };

const PROMPT = (phrase: string) =>
  `You label skills for a women's livelihood app in Kerala. For the skill "${phrase}", return ONLY compact JSON: {"en":"<short English canonical name, lowercase>","ml":"<Malayalam translation>"}. No prose.`;

function parseJson(text: string): Translation | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (typeof o.en === "string" && typeof o.ml === "string") {
      return { en: o.en.trim().toLowerCase(), ml: String(o.ml).trim() };
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

// Bhashini NMT (Government of India / AI4Bharat). Translates one direction; the caller
// pairs the result with the original to produce both halves.
async function viaBhashini(text: string, source: string, target: string): Promise<string | null> {
  const key = process.env.BHASHINI_API_KEY;
  const userId = process.env.BHASHINI_USER_ID;
  if (!key || !userId) return null;

  try {
    const res = await fetch("https://dhruva-api.bhashini.gov.in/services/inference/pipeline", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: key, userID: userId },
      body: JSON.stringify({
        pipelineTasks: [
          {
            taskType: "translation",
            config: {
              language: { sourceLanguage: source, targetLanguage: target },
              ...(process.env.BHASHINI_PIPELINE_ID
                ? { serviceId: process.env.BHASHINI_PIPELINE_ID }
                : {}),
            },
          },
        ],
        inputData: { input: [{ source: text }] },
      }),
    });
    if (!res.ok) {
      console.error(`[bhashini] ${res.status}`);
      return null;
    }
    const data = await res.json();
    const out = data?.pipelineResponse?.[0]?.output?.[0]?.target;
    return typeof out === "string" && out.trim() ? out.trim() : null;
  } catch (e) {
    console.error(`[bhashini] ${String(e)}`);
    return null;
  }
}

export async function translateSkill(phrase: string): Promise<Translation> {
  const clean = phrase.trim();
  const lower = clean.toLowerCase();
  const nvidia = process.env.NVIDIA_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  const src = hasMalayalam(clean) ? "ml" : "en";
  const tgt = src === "ml" ? "en" : "ml";

  try {
    // 1. Bhashini — Indic-specialised, best Malayalam quality.
    const viaGov = await viaBhashini(clean, src, tgt);
    if (viaGov) {
      return src === "en"
        ? { en: lower, ml: viaGov }
        : { en: viaGov.toLowerCase(), ml: clean };
    }

    // 2. LLM providers — used only if a key is set.
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
  } catch (e) {
    console.error(`[translate] ${String(e)}`);
  }
  // 3. Offline fallback: keep the phrase as-is rather than guess.
  return { en: lower, ml: clean };
}
