import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, useEffect, useState } from "react";
import { useAuth } from "./auth";
import { canSpeak, onVoicesReady, speak, stopSpeaking } from "./lib/speech";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "gold" | "ghost" | "danger" | "leaf";
}) {
  const base =
    "min-h-[56px] px-4 rounded-[14px] font-medium text-base transition active:scale-95 disabled:opacity-40";
  const styles: Record<string, string> = {
    primary: "bg-loom-indigo text-loom-cotton hover:bg-loom-indigoSoft",
    gold: "bg-loom-kasavu text-loom-ink hover:brightness-105",
    ghost: "bg-loom-cottonDeep text-loom-indigo hover:brightness-95",
    danger: "bg-loom-madder text-white hover:brightness-110",
    leaf: "bg-loom-leaf text-white hover:brightness-110",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
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
        className={`w-full min-h-[56px] px-3 rounded-[14px] border border-loom-cottonDeep bg-white text-loom-ink text-base ${className}`}
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
      <span className="text-loom-cottonDeep">{"★".repeat(5 - full)}</span>
      {count !== undefined && <span className="text-loom-indigoSoft text-sm ml-1">({count})</span>}
    </span>
  );
}

// Speaks the text in whichever language the user is reading the app in.
//
// Falls back to showing the text only when the device has no voice for that language —
// reading Malayalam aloud in an English voice would be worse than not speaking at all.
export function ListenButton({ text }: { text: string }) {
  const { lang, t } = useAuth();
  const [available, setAvailable] = useState(() => canSpeak(lang));
  const [speaking, setSpeaking] = useState(false);

  // Chrome populates its voice list asynchronously, so the first render can wrongly
  // conclude the language is unsupported.
  useEffect(() => onVoicesReady(() => setAvailable(canSpeak(lang))), [lang]);
  useEffect(() => () => stopSpeaking(), []);

  const onClick = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
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
    } else {
      window.alert(text);
    }
  };

  return (
    <button
      onClick={onClick}
      className="text-loom-indigo text-sm underline min-h-[44px] px-2"
      aria-label={t("listen")}
    >
      {available ? (speaking ? t("stop") : t("listen")) : t("showText")}
    </button>
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
    <nav className="fixed bottom-0 left-0 right-0 max-w-[520px] mx-auto bg-loom-cotton border-t border-loom-cottonDeep flex">
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
      <header className="sticky top-0 bg-loom-cotton px-4 py-3 flex items-center justify-between border-b border-loom-cottonDeep z-10">
        <h1 className="text-xl font-bold text-loom-indigo">{title}</h1>
        {right}
      </header>
      <main className="p-4 space-y-3">{children}</main>
    </div>
  );
}
