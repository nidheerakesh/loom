// Translation, en<->ml. Two use cases share the provider chain below:
//   - translateSkill: labels a genuinely new skill phrase with both canonical names.
//   - translateText: translates arbitrary text (a chat message) into one target language,
//     for chat/translate.ts's "read this in my language" option.
//
// Preference order:
//   BHASHINI_API_KEY + BHASHINI_USER_ID   (preferred — see below)
//   Google Translate's public endpoint    (no key needed — see viaGoogleFree)
//   NVIDIA_API_KEY                        (NVIDIA NIM)
//   ANTHROPIC_API_KEY
//   GEMINI_API_KEY
// Optional: NVIDIA_MODEL (default meta/llama-3.3-70b-instruct), BHASHINI_PIPELINE_ID.
// With nothing configured and Google's endpoint unreachable, falls back to a deterministic
// echo so the app still works offline.
//
// Bhashini leads because it is the Government of India's translation service, built and
// tuned for Indic languages; general-purpose LLMs are noticeably weaker at Malayalam,
// especially on domain vocabulary like garment and craft terms. docs/TDD.md §4 names it.
//
// Google's endpoint comes second, ahead of every LLM key, specifically because it needs no
// key at all: a phrase like "chedi nadal" (a romanized skill, no Malayalam script, so
// hasMalayalam below reads it as English) used to fall straight through every LLM tier that
// had no key configured and land on the echo fallback, storing the literal transliterated
// phrase as both the English AND Malayalam canonical name — never actually translated to
// "planting" / "ചെടി നടൽ". A provider that always works closes that gap without asking
// anyone to configure a paid key first.
//
// The previous keyless step, MyMemory, was removed for poor Malayalam quality that could
// mis-group providers under a wrong canonical name. Google Translate's quality bar is
// considerably higher, so it replaces that role rather than reintroducing the same problem.

export type Translation = { en: string; ml: string };

const SKILL_PROMPT = (phrase: string) =>
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
async function viaNvidia(prompt: string, key: string): Promise<string | null> {
  const model = process.env.NVIDIA_MODEL ?? "meta/llama-3.3-70b-instruct";
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    console.error(`[nim] ${res.status} model=${model}: ${(await res.text()).slice(0, 300)}`);
    return null;
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === "string" ? text : null;
}

async function viaAnthropic(prompt: string, key: string): Promise<string | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  return typeof text === "string" ? text : null;
}

async function viaGemini(prompt: string, key: string): Promise<string | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  if (!res.ok) return null;
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" ? text : null;
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

// Google Translate's public web endpoint — the same one translate.google.com's own page
// calls, undocumented but stable and widely relied on, and needs no API key or billing
// account. Not a fit for high-volume production traffic (no SLA, no quota guarantee), but
// exactly right here: occasional new-skill labeling and on-demand chat message translation,
// not a bulk pipeline.
async function viaGoogleFree(text: string, source: string, target: string): Promise<string | null> {
  try {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}` +
      `&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[google-translate] ${res.status}`);
      return null;
    }
    const data = await res.json();
    // Response shape: [[["translated chunk","source chunk",null,null,...], ...], ...]
    const chunks = data?.[0];
    if (!Array.isArray(chunks)) return null;
    const out = chunks.map((c: unknown[]) => c?.[0]).filter((s: unknown) => typeof s === "string").join("");
    return out.trim() || null;
  } catch (e) {
    console.error(`[google-translate] ${String(e)}`);
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
      return src === "en" ? { en: lower, ml: viaGov } : { en: viaGov.toLowerCase(), ml: clean };
    }

    // 2. Google Translate — no key needed, good general quality, closes the gap for anyone
    // who hasn't configured a paid provider.
    const viaGoogle = await viaGoogleFree(clean, src, tgt);
    if (viaGoogle) {
      return src === "en" ? { en: lower, ml: viaGoogle } : { en: viaGoogle.toLowerCase(), ml: clean };
    }

    // 3. LLM providers — used only if a key is set.
    if (nvidia) {
      const t = parseJson((await viaNvidia(SKILL_PROMPT(clean), nvidia)) ?? "");
      if (t) return t;
    }
    if (anthropic) {
      const t = parseJson((await viaAnthropic(SKILL_PROMPT(clean), anthropic)) ?? "");
      if (t) return t;
    }
    if (gemini) {
      const t = parseJson((await viaGemini(SKILL_PROMPT(clean), gemini)) ?? "");
      if (t) return t;
    }
  } catch (e) {
    console.error(`[translate] ${String(e)}`);
  }
  // 4. Offline fallback: keep the phrase as-is rather than guess.
  return { en: lower, ml: clean };
}

// Translate arbitrary text (a chat message) into one target language — used by
// chat/translate.ts. Same provider chain as translateSkill, minus the skill-labeling JSON
// shape: this returns plain translated text, not a {en, ml} pair, since the caller already
// knows what language the text is in and just wants the other one.
export async function translateText(text: string, targetLang: "en" | "ml"): Promise<string> {
  const clean = text.trim();
  if (!clean) return clean;
  const source = targetLang === "ml" ? "en" : "ml";
  const nvidia = process.env.NVIDIA_API_KEY;
  const anthropic = process.env.ANTHROPIC_API_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  const genericPrompt =
    `Translate the following message into ${targetLang === "ml" ? "Malayalam" : "English"}. ` +
    `Return ONLY the translation, no quotes, no explanation, no prose:\n\n${clean}`;

  try {
    const viaGov = await viaBhashini(clean, source, targetLang);
    if (viaGov) return viaGov;

    const viaGoogle = await viaGoogleFree(clean, source, targetLang);
    if (viaGoogle) return viaGoogle;

    if (nvidia) {
      const t = await viaNvidia(genericPrompt, nvidia);
      if (t) return t.trim();
    }
    if (anthropic) {
      const t = await viaAnthropic(genericPrompt, anthropic);
      if (t) return t.trim();
    }
    if (gemini) {
      const t = await viaGemini(genericPrompt, gemini);
      if (t) return t.trim();
    }
  } catch (e) {
    console.error(`[translate] ${String(e)}`);
  }
  // Nothing available — the caller shows this back, so an unmodified original is a better
  // failure than an empty string or an error toast for something this low-stakes.
  return clean;
}
