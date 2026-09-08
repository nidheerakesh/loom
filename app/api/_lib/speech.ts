// Malayalam speech in and out, behind the adapter shape docs/TDD.md §4 specifies.
//
// Preference order, mirroring translate.ts and for the same reason: Bhashini is the Government
// of India's service, built and tuned for Indic languages, and general-purpose models are
// noticeably weaker at Malayalam. Sarvam follows because it is Indian and handles the
// Manglish code-switching people actually speak. With no key at all, both return null.
//
//   ASR:  BHASHINI_API_KEY + BHASHINI_USER_ID  →  SARVAM_API_KEY  →  null
//   TTS:  SARVAM_API_KEY  →  BHASHINI_API_KEY  →  null (the browser's own voice takes over)
//
// Returning null rather than guessing is the whole design. A wrong transcript here is not
// degraded output: it puts a skill she never said into the shared taxonomy, or applies her to
// the wrong job. The keyless path in translate.ts echoes a phrase unchanged for exactly this
// reason, and this one asks her to type instead. Silence is recoverable; a confident error is
// not.

const BHASHINI = "https://dhruva-api.bhashini.gov.in/services/inference/pipeline";
const SARVAM_STT = "https://api.sarvam.ai/speech-to-text";
const SARVAM_TTS = "https://api.sarvam.ai/text-to-speech";

export type Transcript = { text: string; source: "bhashini" | "sarvam" };
export type Clip = { audioBase64: string; mime: string; source: "sarvam" | "bhashini" };

// ---------------------------------------------------------------- speech to text

async function sttBhashini(audioBase64: string, lang: string): Promise<Transcript | null> {
  const key = process.env.BHASHINI_API_KEY;
  const userId = process.env.BHASHINI_USER_ID;
  if (!key || !userId) return null;

  try {
    const res = await fetch(BHASHINI, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: key, userID: userId },
      body: JSON.stringify({
        pipelineTasks: [
          {
            taskType: "asr",
            config: {
              language: { sourceLanguage: lang },
              audioFormat: "wav",
              samplingRate: 16000,
              ...(process.env.BHASHINI_ASR_SERVICE_ID
                ? { serviceId: process.env.BHASHINI_ASR_SERVICE_ID }
                : {}),
            },
          },
        ],
        inputData: { audio: [{ audioContent: audioBase64 }] },
      }),
    });
    if (!res.ok) {
      console.error(`[bhashini-asr] ${res.status}`);
      return null;
    }
    const data = await res.json();
    const out = data?.pipelineResponse?.[0]?.output?.[0]?.source;
    return typeof out === "string" && out.trim() ? { text: out.trim(), source: "bhashini" } : null;
  } catch (e) {
    console.error(`[bhashini-asr] ${String(e)}`);
    return null;
  }
}

async function sttSarvam(
  audio: Buffer,
  mime: string,
  lang: string,
): Promise<Transcript | null> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return null;

  try {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: mime }), "audio");
    // saarika:* is the older family and is rejected outright; the current models are
    // saaras:v3 (default) and saaras:v4. Both fields are optional, but naming the language
    // measurably helps Malayalam.
    form.append("model", process.env.SARVAM_STT_MODEL ?? "saaras:v3");
    form.append("language_code", lang === "ml" ? "ml-IN" : "en-IN");

    const res = await fetch(SARVAM_STT, {
      method: "POST",
      headers: { "api-subscription-key": key },
      body: form,
    });
    if (!res.ok) {
      console.error(`[sarvam-asr] ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const out = data?.transcript;
    return typeof out === "string" && out.trim() ? { text: out.trim(), source: "sarvam" } : null;
  } catch (e) {
    console.error(`[sarvam-asr] ${String(e)}`);
    return null;
  }
}

export async function transcribe(
  audio: Buffer,
  mime: string,
  lang: "ml" | "en" = "ml",
): Promise<Transcript | null> {
  // Bhashini takes base64 and wants wav; Sarvam takes the file as-is and copes with what
  // WhatsApp actually sends, which is ogg/opus. So Sarvam handles the common case in practice
  // and Bhashini leads on quality when the audio suits it.
  return (
    (await sttBhashini(audio.toString("base64"), lang)) ?? (await sttSarvam(audio, mime, lang))
  );
}

export function sttConfigured(): boolean {
  return Boolean(
    (process.env.BHASHINI_API_KEY && process.env.BHASHINI_USER_ID) || process.env.SARVAM_API_KEY,
  );
}

// ---------------------------------------------------------------- text to speech

async function ttsSarvam(text: string, lang: string): Promise<Clip | null> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(SARVAM_TTS, {
      method: "POST",
      headers: { "api-subscription-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        // `language_code`, not `target_language_code` — the latter is the translate endpoint's
        // field name and silently fails validation here.
        text: text.slice(0, 2000),
        language_code: lang === "ml" ? "ml-IN" : "en-IN",
        // Speaker names are model-specific and lowercase: v2's set (anushka, manisha…) is
        // rejected by v3. A female voice by default, for a product whose users are women.
        speaker: process.env.SARVAM_TTS_SPEAKER ?? "kavitha",
        model: process.env.SARVAM_TTS_MODEL ?? "bulbul:v3",
        // Instructional content in a language she may be hearing read aloud for the first
        // time. The app's own browser voice is slowed for the same reason.
        pace: 0.9,
      }),
    });
    if (!res.ok) {
      console.error(`[sarvam-tts] ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const b64 = data?.audios?.[0];
    return typeof b64 === "string" && b64
      ? { audioBase64: b64, mime: "audio/wav", source: "sarvam" }
      : null;
  } catch (e) {
    console.error(`[sarvam-tts] ${String(e)}`);
    return null;
  }
}

async function ttsBhashini(text: string, lang: string): Promise<Clip | null> {
  const key = process.env.BHASHINI_API_KEY;
  const userId = process.env.BHASHINI_USER_ID;
  if (!key || !userId) return null;

  try {
    const res = await fetch(BHASHINI, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: key, userID: userId },
      body: JSON.stringify({
        pipelineTasks: [
          {
            taskType: "tts",
            config: {
              language: { sourceLanguage: lang },
              gender: "female",
              ...(process.env.BHASHINI_TTS_SERVICE_ID
                ? { serviceId: process.env.BHASHINI_TTS_SERVICE_ID }
                : {}),
            },
          },
        ],
        inputData: { input: [{ source: text.slice(0, 2000) }] },
      }),
    });
    if (!res.ok) {
      console.error(`[bhashini-tts] ${res.status}`);
      return null;
    }
    const data = await res.json();
    const b64 = data?.pipelineResponse?.[0]?.audio?.[0]?.audioContent;
    return typeof b64 === "string" && b64
      ? { audioBase64: b64, mime: "audio/wav", source: "bhashini" }
      : null;
  } catch (e) {
    console.error(`[bhashini-tts] ${String(e)}`);
    return null;
  }
}

// Null means "no server voice available" — the caller falls back to the browser's own engine,
// which is what the app has always used and costs nothing. Unlike ASR there is no harm in
// falling back here: a device voice reading correct text is not wrong, only less good.
export async function synthesize(text: string, lang: "ml" | "en" = "ml"): Promise<Clip | null> {
  return (await ttsSarvam(text, lang)) ?? (await ttsBhashini(text, lang));
}

export function ttsConfigured(): boolean {
  return Boolean(
    process.env.SARVAM_API_KEY || (process.env.BHASHINI_API_KEY && process.env.BHASHINI_USER_ID),
  );
}
