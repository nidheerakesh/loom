import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth";
import { canSpeak, onVoicesReady, speak, stopSpeaking } from "./lib/speech";
import { malayalamizeNumbers } from "./lib/malayalamNumbers";
import { apiPost } from "./lib/api";
import { ThemeToggle } from "./components/ThemeToggle";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "gold" | "ghost" | "danger" | "leaf";
}) {
  // `transition-transform`, not the blanket `transition`.
  //
  // Tailwind's `transition` includes background-color, and a CSS transition on a background
  // whose value comes from a custom property is never re-triggered by Chromium when that
  // property changes. Switching themes left every button painted in the previous palette —
  // a dark-indigo button on a dark page — while getComputedStyle reported the new variable.
  // Only a full restyle cleared it, and next-themes' disableTransitionOnChange did not.
  // `body` was unaffected because it carries no transition, which is what isolated it.
  //
  // The press animation is a transform and still runs. The hover colour change is now instant,
  // which costs nothing on the touch devices this is built for.
  const base =
    "min-h-[56px] px-4 rounded-[14px] font-medium text-base transition-transform active:scale-95 disabled:opacity-40";
  const styles: Record<string, string> = {
    primary: "bg-loom-indigo text-loom-cotton hover:bg-loom-indigoSoft",
    gold: "bg-loom-kasavu text-loom-ink hover:brightness-105",
    ghost: "bg-loom-cottonDeep text-loom-indigo hover:brightness-95",
    danger: "bg-loom-madder text-white hover:brightness-110",
    leaf: "bg-loom-leaf text-white hover:brightness-110",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

// Text-style control — a back link, a language toggle, "skip for now".
//
// Visually a link, but still a tap target, and these were rendering as little as 20px tall:
// the language toggle, which is the single most important control for a Malayalam speaker who
// has landed in English, was 20x46px. UI_UX §6 puts the floor at 56px and does not exempt
// controls for looking like text.
export function TextButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`min-h-[56px] px-2 inline-flex items-center justify-center text-sm underline text-loom-indigoSoft ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-loom-cottonDeep rounded-[14px] p-4 shadow-sm ${className}`}>{children}</div>
  );
}

export function Field({
  label,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block mb-3">
      {label && <span className="block text-sm text-loom-indigoSoft mb-1">{label}</span>}
      <input
        className={`w-full min-h-[56px] px-3 rounded-[14px] border border-loom-line bg-loom-paper text-loom-ink text-base ${className}`}
        {...props}
      />
    </label>
  );
}

export function Stars({ value, count }: { value: number; count?: number }) {
  const full = Math.round(value);
  return (
    <span className="text-loom-kasavu" title={`${value}`}>
      {"★".repeat(full)}
      <span className="text-loom-line">{"★".repeat(5 - full)}</span>
      {count !== undefined && <span className="text-loom-indigoSoft text-sm ml-1">({count})</span>}
    </span>
  );
}

// Speaks the text in whichever language the user is reading the app in.
//
// Falls back to showing the text only when the device has no voice for that language —
// reading Malayalam aloud in an English voice would be worse than not speaking at all.
export function ListenButton({ text }: { text: string }) {
  const { lang, t, token } = useAuth();
  const [available, setAvailable] = useState(() => canSpeak(lang));
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Chrome populates its voice list asynchronously, so the first render can wrongly
  // conclude the language is unsupported.
  useEffect(() => onVoicesReady(() => setAvailable(canSpeak(lang))), [lang]);
  useEffect(() => () => stopSpeaking(), []);

  const onClick = () => {
    if (speaking) {
      stopSpeaking();
      audioRef.current?.pause();
      setSpeaking(false);
      return;
    }

    // Try the server voice first — it does not care what the device has installed, which is
    // the whole point. If no key is configured the route says `available: false` and this
    // falls through to the browser engine that has always been here.
    void (async () => {
      if (!token) return;
      // Same fix as the device voice: the server voice (Bhashini/Sarvam) reads bare digits in
      // English too, so numbers are converted to Malayalam words before either voice hears them.
      const spokenText = lang === "ml" ? malayalamizeNumbers(text) : text;
      try {
        const res = await apiPost<{ available: boolean; audio?: string; mime?: string }>(
          "/api/narration/speak",
          { token, text: spokenText, lang },
        );
        if (res.available && res.audio) {
          const el = new Audio(`data:${res.mime ?? "audio/wav"};base64,${res.audio}`);
          audioRef.current = el;
          el.onended = () => setSpeaking(false);
          setSpeaking(true);
          await el.play();
          return;
        }
      } catch {
        // Network trouble is not a reason to stay silent when the device can speak.
      }
      speakOnDevice();
    })();
  };

  const speakOnDevice = () => {
    const result = speak(text, lang);
    if (result === "spoken") {
      setSpeaking(true);
      // No reliable cross-browser "ended" event on cancel, so clear on the next tick of
      // silence rather than tracking utterance lifecycle.
      const poll = setInterval(() => {
        if (!window.speechSynthesis.speaking) {
          setSpeaking(false);
          clearInterval(poll);
        }
      }, 400);
    }
  };

  // Shown whenever there is any chance of being heard. The device voice is no longer the only
  // source — the server may have one — so hiding on `!available` would hide a button that
  // works. It stays hidden only when signed out, where neither path can run.
  if (!available && !token) return null;

  return (
    <button
      onClick={onClick}
      className="text-loom-indigo text-sm underline min-h-[56px] px-3 inline-flex items-center"
      aria-label={t("listen")}
    >
      {speaking ? t("stop") : t("listen")}
    </button>
  );
}

// Pick a rating. Replaces a single button hardcoded to five stars, which meant every rating
// in the system was a five and the score carried no information.
export function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          role="radio"
          aria-checked={value === n}
          aria-label={`${n}`}
          onClick={() => onChange(n)}
          className={`min-h-[56px] w-14 text-2xl leading-none ${
            n <= value ? "text-loom-kasavu" : "text-loom-line"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function TabBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (k: string) => void;
}) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-[520px] mx-auto bg-loom-cotton border-t border-loom-line flex">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          aria-current={active === tab.key ? "page" : undefined}
          // The active tab was carried by colour alone once the icons went; a top rule gives
          // it a second, non-colour cue.
          className={`flex-1 py-3 min-h-[56px] flex items-center justify-center text-sm border-t-2 ${
            active === tab.key
              ? "text-loom-indigo font-semibold border-loom-indigo"
              : "text-loom-indigoSoft border-transparent"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export function Screen({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="max-w-[520px] mx-auto min-h-screen bg-loom-cotton pb-24">
      <header className="sticky top-0 bg-loom-cotton px-4 py-3 flex items-center justify-between border-b border-loom-line z-10">
        <h1 className="text-xl font-bold text-loom-indigo tracking-tight">{title}</h1>
        {/* The theme control belongs on every screen, not only where somebody remembered to
            pass one in — a toggle that disappears once you are signed in reads as unfinished. */}
        <div className="flex items-center gap-1">
          {right}
          <ThemeToggle />
        </div>
      </header>
      <main className="p-4 space-y-3">{children}</main>
    </div>
  );
}
