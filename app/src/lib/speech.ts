import type { Lang } from "../i18n";

// Text-to-speech, matching the TextToSpeech adapter shape in docs/TDD.md §4.
//
// The app is built for people who may not read fluently, so every piece of narration is
// meant to be speakable. Until now nothing ever spoke: ListenButton popped a window.alert
// showing the text, which is exactly the wrong affordance for the person it was added for.
//
// This uses the browser's own speech engine — no key, no network, no cost, and it works on
// the low-end Android devices the app targets. Bhashini or Sarvam can replace `speak()`
// behind the same signature when a key exists; TDD §4 names both.

const LOCALE: Record<Lang, string> = { ml: "ml-IN", en: "en-IN" };

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : null;
}

// Voice lists load asynchronously in most browsers and are empty on first call.
function voicesFor(tag: string): SpeechSynthesisVoice[] {
  const s = synth();
  if (!s) return [];
  const prefix = tag.split("-")[0];
  return s.getVoices().filter((v) => v.lang === tag || v.lang.startsWith(`${prefix}-`) || v.lang === prefix);
}

// Whether this device can actually speak the language. Callers use it to decide whether to
// offer a listen control at all, rather than offering one that silently does nothing.
export function canSpeak(lang: Lang): boolean {
  return synth() !== null && voicesFor(LOCALE[lang]).length > 0;
}

export type SpeakResult = "spoken" | "unsupported" | "no-voice";

export function speak(text: string, lang: Lang): SpeakResult {
  const s = synth();
  if (!s || !text.trim()) return "unsupported";

  const tag = LOCALE[lang];
  const voices = voicesFor(tag);

  // Deliberately refuse rather than fall back to an English voice. A Malayalam sentence read
  // by an en-US voice is not degraded output, it is unintelligible — and worse, it sounds
  // like the app is broken rather than unsupported. The caller keeps showing the text.
  if (voices.length === 0) return "no-voice";

  s.cancel(); // barge-in: a new utterance replaces whatever is still playing
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voices[0];
  u.lang = tag;
  u.rate = 0.95; // marginally slower — this is instructional content, often unfamiliar terms
  s.speak(u);
  return "spoken";
}

export function stopSpeaking(): void {
  synth()?.cancel();
}

// Resolves once the browser has populated its voice list, so `canSpeak` is meaningful.
// Chrome fires `voiceschanged` after an async load; Safari and Firefox populate immediately.
export function onVoicesReady(cb: () => void): () => void {
  const s = synth();
  if (!s) return () => {};
  if (s.getVoices().length > 0) {
    cb();
    return () => {};
  }
  const handler = () => cb();
  s.addEventListener("voiceschanged", handler);
  return () => s.removeEventListener("voiceschanged", handler);
}
