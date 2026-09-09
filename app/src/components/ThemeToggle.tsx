import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useAuth } from "../auth";

// Light/dark toggle, sitting beside the language toggle and built like it.
//
// This replaces a three-way Sun/Moon/Desktop control built on the shadcn ToggleGroup and Radix
// icons. That version was never imported by anything, and it was the only place in the entire
// app that would have rendered an icon — a lone icon triplet next to text-only controls reads
// as imported from somewhere else, because it was.
//
// Two states rather than three. "System" is still honoured: it is the starting value until she
// chooses, which is the behaviour people actually want from it. A third button to go back to
// following the OS is a preference nobody asked for on a phone.
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useAuth();

  // next-themes cannot know the resolved theme until it has read the DOM, so the first render
  // would otherwise announce the wrong one and flip.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const dark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(dark ? "light" : "dark")}
      // Matches TextButton's 56px floor. UI_UX §6 does not exempt controls for looking like text.
      className={`min-h-[56px] px-2 inline-flex items-center justify-center text-sm text-loom-indigoSoft ${className}`}
      aria-label={dark ? t("themeLight") : t("themeDark")}
      // Until mounted the glyph would be wrong, and a control that changes under her thumb is
      // worse than one that arrives a frame late.
      style={{ visibility: ready ? "visible" : "hidden" }}
    >
      <span aria-hidden="true" className="text-base">
        {dark ? "☀" : "☾"}
      </span>
    </button>
  );
}
