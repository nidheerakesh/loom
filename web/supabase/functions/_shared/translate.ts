// Translate NEW skills (en↔ml + emoji). Keyless via MyMemory; LLM (NVIDIA NIM / Anthropic /
// Gemini) preferred when a secret is set. Set with: supabase secrets set NVIDIA_API_KEY=...
export type Translation = { en: string; ml: string; emoji: string };

const PROMPT = (p: string) =>
  `You label skills for a women's livelihood app in Kerala. For the skill "${p}", return ONLY compact JSON: {"en":"<short English canonical, lowercase>","ml":"<Malayalam>","emoji":"<one emoji>"}. No prose.`;

function parseJson(text: string): Translation | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (typeof o.en === "string" && typeof o.ml === "string")
      return { en: o.en.trim().toLowerCase(), ml: String(o.ml).trim(), emoji: o.emoji || "🛠️" };
  } catch { /* ignore */ }
  return null;
}

async function viaNvidia(p: string, key: string): Promise<Translation | null> {
  const model = Deno.env.get("NVIDIA_MODEL") ?? "meta/llama-3.3-70b-instruct";
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: 200, temperature: 0.2, messages: [{ role: "user", content: PROMPT(p) }] }),
  });
  if (!res.ok) return null;
  const d = await res.json();
  const t = d?.choices?.[0]?.message?.content;
  return typeof t === "string" ? parseJson(t) : null;
}

async function viaAnthropic(p: string, key: string): Promise<Translation | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 200, messages: [{ role: "user", content: PROMPT(p) }] }),
  });
  if (!res.ok) return null;
  const d = await res.json();
  const t = d?.content?.[0]?.text;
  return typeof t === "string" ? parseJson(t) : null;
}

async function viaMyMemory(text: string, source: string, target: string): Promise<string | null> {
  const res = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`,
  );
  if (!res.ok) return null;
  const d = await res.json();
  const t = d?.responseData?.translatedText;
  return typeof t === "string" && t.trim() ? t.trim() : null;
}

function hasMalayalam(s: string): boolean {
  return /[ഀ-ൿ]/.test(s);
}
function guessEmoji(en: string): string {
  const map: [RegExp, string][] = [
    [/stitch|tailor|sew|garment|embroider/, "🧵"], [/cut/, "✂️"], [/pack|box|wrap/, "📦"],
    [/cook|cater|food|bak|pickle/, "🍲"], [/craft|art|paint|pottery|clay|weav/, "🎨"],
    [/tutor|teach|coach/, "📚"], [/bee|honey|farm|garden|agri/, "🐝"],
    [/clean|wash/, "🧹"], [/beaut|salon|hair|mehendi|henna/, "💅"],
  ];
  for (const [re, e] of map) if (re.test(en)) return e;
  return "🛠️";
}

export async function translateSkill(phrase: string): Promise<Translation> {
  const clean = phrase.trim();
  const lower = clean.toLowerCase();
  try {
    const nim = Deno.env.get("NVIDIA_API_KEY");
    const anthropic = Deno.env.get("ANTHROPIC_API_KEY");
    if (nim) { const t = await viaNvidia(clean, nim); if (t) return t; }
    if (anthropic) { const t = await viaAnthropic(clean, anthropic); if (t) return t; }
    const src = hasMalayalam(clean) ? "ml" : "en";
    const tgt = src === "ml" ? "en" : "ml";
    const translated = await viaMyMemory(clean, src, tgt);
    if (translated) {
      const en = src === "en" ? lower : translated.toLowerCase();
      const ml = src === "ml" ? clean : translated;
      return { en, ml, emoji: guessEmoji(en) };
    }
  } catch (_e) { /* fall through */ }
  return { en: lower, ml: clean, emoji: guessEmoji(lower) };
}
