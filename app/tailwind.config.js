/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "selector",
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  safelist: ["dark"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        sm: "1000px",
      },
    },
    extend: {
      colors: {
        // Defined as CSS variables in src/index.css, not as hexes here — a hex is a constant
        // and `.dark` cannot re-point it.
        //
        // Plain `var()` rather than the usual `rgb(var(--x) / <alpha-value>)` channel form:
        // that form nests a second var in the alpha slot, which breaks style invalidation in
        // Chromium and leaves every button painted in the old palette after a theme toggle.
        // See the note in index.css. Trade-off: no `/opacity` modifier on loom colours.
        loom: {
          cotton: "var(--loom-cotton)",
          cottonDeep: "var(--loom-cottonDeep)",
          indigo: "var(--loom-indigo)",
          indigoSoft: "var(--loom-indigoSoft)",
          kasavu: "var(--loom-kasavu)",
          turmeric: "var(--loom-turmeric)",
          madder: "var(--loom-madder)",
          leaf: "var(--loom-leaf)",
          ink: "var(--loom-ink)",
          // Borders, split out of cottonDeep — see the note in index.css.
          line: "var(--loom-line)",
          // Input fields, replacing the hardcoded bg-white in ui.tsx.
          paper: "var(--loom-paper)",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
