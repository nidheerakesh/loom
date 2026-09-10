import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth";
import { Button, ListenButton, TextButton } from "../../ui";

// The Web Speech API's SpeechRecognition ships under a vendor prefix on every browser that
// implements it (Chrome, and Chrome-based WebViews — which is what the demo Android phone
// runs) and isn't in TypeScript's own lib.dom types. Declared narrowly, to exactly what this
// file uses, rather than pulling in a third-party types package for one component.
interface SpeechRecognitionResult {
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEvent {
  resultIndex: number;
  results: { [index: number]: SpeechRecognitionResult & { isFinal: boolean }; length: number };
}
interface SpeechRecognitionErrorEvent {
  error: string;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}

function getRecognitionCtor(): (new () => SpeechRecognition) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// A skill spoken aloud is never applied straight into the skill field, only into this review
// line beside it — same rule the raw→canonical read-back already enforces for typed skills,
// and more important here, not less: `പാചകം` (cooking) and `പഞ്ചകം` (a five-day period) are one
// phoneme apart, and a misheard word landing silently in her skill list is worse than one she
// typed wrong, because she has no way to notice it happened.
export function SkillMic({ onConfirm }: { onConfirm: (text: string) => void }) {
  const { lang, t } = useAuth();
  const [supported] = useState(() => getRecognitionCtor() !== null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  if (!supported) return null;

  const start = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    setError(null);
    setTranscript("");
    const recognition = new Ctor();
    recognition.lang = lang === "ml" ? "ml-IN" : "en-IN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript;
      setTranscript(text);
    };
    recognition.onerror = (e) => {
      // "no-speech" and "aborted" are not failures worth a message — she stayed quiet, or
      // stopped it herself. Everything else gets one, because a silently dead mic button looks
      // like it never worked at all.
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(e.error === "not-allowed" ? t("micDenied") : t("micError"));
      }
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const confirm = () => {
    onConfirm(transcript.trim());
    setTranscript("");
  };

  return (
    <div className="mb-3">
      <Button variant={listening ? "danger" : "ghost"} onClick={listening ? stop : start}>
        {listening ? `■ ${t("micListening")}` : `🎤 ${t("micSpeak")}`}
      </Button>
      {error && <div className="text-loom-madder text-sm mt-1">{error}</div>}
      {transcript && (
        <div className="mt-2 flex items-start gap-2 bg-loom-cottonDeep rounded-[14px] p-3">
          <div className="flex-1">
            <div className="text-xs text-loom-indigoSoft mb-1">{t("micReview")}</div>
            <div className="text-loom-ink">{transcript}</div>
          </div>
          <ListenButton text={transcript} />
          <div className="flex flex-col gap-1">
            <Button variant="gold" onClick={confirm}>
              {t("micAdd")}
            </Button>
            <TextButton onClick={() => setTranscript("")}>{t("cancel")}</TextButton>
          </div>
        </div>
      )}
    </div>
  );
}
