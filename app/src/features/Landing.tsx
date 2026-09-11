import { useAuth } from "../auth";
import { Button, TextButton } from "../ui";
import { ThemeToggle } from "../components/ThemeToggle";

// What a first-time visitor sees.
//
// Before this, App.tsx rendered SignIn the instant there was no token, so the first screen
// anyone met — a judge, a customer, a coordinator deciding whether to trust this — was a bare
// phone-number field. The product explained itself only after you had already signed in.
//
// Copy is carried over from docs/presentation/landing-page.html, which was already written and
// already true, rather than invented again.
//
// Built from the loom CSS variables, so it follows the theme without a single dark: variant.

// The mark is a loom: five warp threads with two weft threads crossing over and under. It is
// the one piece of real visual identity the project has, so it is worth keeping rather than
// replacing with a generic wordmark. Animation is staggered so it reads as weaving; anyone who
// has asked their system not to animate gets it drawn already finished.
function WovenMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} role="img" aria-label="Loom">
      <g fill="currentColor" className="text-loom-indigo">
        {[8, 25, 42, 59, 76].map((x, i) => (
          <rect key={x} x={x} y="6" width="9" height="84" rx="4.5" className="warp" style={{ animationDelay: `${i * 90}ms` }} />
        ))}
      </g>
      <g className="text-loom-kasavu" fill="currentColor">
        {[30, 57].map((y, i) => (
          <rect key={y} x="4" y={y} width="88" height="9" rx="4.5" className="weft" style={{ animationDelay: `${450 + i * 140}ms` }} />
        ))}
      </g>
      {/* The over-crossings: warp painted back on top of weft, which is what makes it read as
          woven rather than as a grid. */}
      <g fill="currentColor" className="text-loom-indigo over">
        {[
          [8, 30], [42, 30], [76, 30], [25, 57], [59, 57],
        ].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="9" height="9" />
        ))}
      </g>
    </svg>
  );
}

function Section({
  eyebrow,
  head,
  children,
}: {
  eyebrow: string;
  head: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-t border-loom-line pt-10 mt-14">
      <p className="text-xs uppercase tracking-[0.18em] text-loom-kasavu font-semibold mb-3">
        {eyebrow}
      </p>
      <h2 className="text-[clamp(20px,5.5vw,26px)] leading-[1.25] font-bold text-loom-indigo tracking-tight mb-4 break-words">
        {head}
      </h2>
      {children}
    </section>
  );
}

export function Landing({ onSignIn }: { onSignIn: () => void }) {
  const { t, lang, setLang } = useAuth();

  // The seeded thirty-uniform order, which is also what the demo runs. Real output, not a mockup.
  const team = [
    ["Kudumbashree Tailoring Unit", "SHG 4", 5],
    ["Ponnu Tailoring", "SHG 2", 3],
    ["Remya Suresh", "SHG 4", 1],
    ["Anju Haridas", "SHG 4", 1],
  ] as const;

  return (
    <div className="min-h-screen bg-loom-cotton">
      {/* A single gold thread down the edge of the page — the loom, carried through the whole
          scroll. Hidden on narrow screens where it would only steal width. */}
      <div
        aria-hidden="true"
        className="hidden sm:block fixed left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-loom-kasavu via-loom-turmeric to-transparent"
      />

      <div className="max-w-[720px] mx-auto px-6 pb-20">
        <header className="pt-6">
          <div className="flex items-center justify-between mb-10">
            <div className="flex items-center gap-2">
              <WovenMark className="w-7 h-7" />
              <b className="text-loom-indigo text-lg">
                Loom <span className="text-loom-indigoSoft font-semibold">ലൂം</span>
              </b>
            </div>
            <div className="flex items-center gap-1">
              <TextButton onClick={() => setLang(lang === "ml" ? "en" : "ml")}>
                {lang === "ml" ? "English" : "മലയാളം"}
              </TextButton>
              <ThemeToggle />
            </div>
          </div>

          {/* Malayalam builds long compounds — "എത്തിപ്പിടിക്കാനാവാത്ത" is a single word — and at
              9vw on a 360px phone one of them is wider than the screen, which pushed the whole
              page into a horizontal scroll. A lower floor makes it fit by size; `break-words` is
              the safety net, and only ever acts on a word that genuinely cannot fit. Sizing the
              display type off the shorter English string is the easy mistake here. */}
          <h1 className="text-[clamp(28px,7.5vw,56px)] leading-[1.1] font-bold text-loom-indigo tracking-[-0.03em] break-words">
            {t("landHeadA")}{" "}
            <em className="not-italic text-loom-kasavu">{t("landHeadB")}</em>
          </h1>
          <p className="mt-5 text-lg text-loom-indigoSoft leading-relaxed">{t("landSub")}</p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button onClick={onSignIn}>{t("landOpen")}</Button>
            <a
              href="https://github.com/nidheerakesh/loom"
              className="min-h-[56px] px-4 inline-flex items-center rounded-[14px] bg-loom-cottonDeep text-loom-indigo font-medium"
            >
              {t("landCode")}
            </a>
          </div>
        </header>

        <Section eyebrow={t("landProblemEyebrow")} head={t("landProblemHead")}>
          <p className="text-loom-ink leading-relaxed mb-3">{t("landProblem1")}</p>
          <p className="text-loom-ink leading-relaxed">{t("landProblem2")}</p>

          {/* Two figures, both published by the programmes they describe. A third — women's ICT
              skills at 13.9% against 22.8% — was on the original page with no source anywhere in
              the repository, so it is left out rather than asserted. */}
          <div className="grid grid-cols-2 gap-3 mt-7">
            {[
              ["8.5M+", t("landStat1")],
              ["4.5M", t("landStat2")],
            ].map(([n, label]) => (
              <div key={n} className="bg-loom-cottonDeep rounded-[14px] p-4">
                <b className="block text-3xl text-loom-indigo tnum tracking-tight">{n}</b>
                <span className="text-sm text-loom-indigoSoft leading-snug">{label}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow={t("landDoesEyebrow")} head={t("landDoesHead")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="bg-loom-cottonDeep rounded-[14px] p-4">
              <h3 className="font-semibold text-loom-indigo mb-1">{t("landIndividual")}</h3>
              <p className="text-sm text-loom-ink leading-relaxed">{t("landIndividualBody")}</p>
            </div>
            {/* The one that matters, marked as such — a gold edge rather than a louder colour. */}
            <div className="bg-loom-cottonDeep rounded-[14px] p-4 border-l-4 border-loom-kasavu">
              <h3 className="font-semibold text-loom-indigo mb-1">{t("landCollective")}</h3>
              <p className="text-sm text-loom-ink leading-relaxed">{t("landCollectiveBody")}</p>
            </div>
          </div>
        </Section>

        <Section eyebrow={t("landAssemblyEyebrow")} head={t("landAssemblyHead")}>
          <p className="text-loom-ink leading-relaxed">{t("landAssemblyLead")}</p>

          <div className="mt-5 rounded-[14px] border border-loom-line overflow-hidden">
            <p className="bg-loom-cottonDeep px-4 py-3 text-sm text-loom-indigo border-b border-loom-line">
              <strong>4 providers across 2 groups cover stitching.</strong> Coverage complete.
            </p>
            {team.map(([name, shg, units]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-3 px-4 py-3 border-b border-loom-line last:border-b-0"
              >
                <span className="text-loom-ink text-sm flex-1">{name}</span>
                <span className="text-loom-indigoSoft text-xs">{shg}</span>
                <span className="text-loom-indigo text-sm tnum w-16 text-right">
                  {units} {t("landUnits")}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-loom-indigoSoft leading-relaxed">{t("landAssemblyFoot")}</p>
        </Section>

        <Section eyebrow={t("landHowEyebrow")} head={t("landHowHead")}>
          <ol className="space-y-5">
            {[
              [t("landStep1"), t("landStep1Body")],
              [t("landStep2"), t("landStep2Body")],
              [t("landStep3"), t("landStep3Body")],
            ].map(([head, body], i) => (
              <li key={head} className="flex gap-4">
                <span className="text-loom-kasavu font-bold tnum text-lg leading-none pt-1">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>
                  <b className="block text-loom-indigo mb-1">{head}</b>
                  <span className="text-sm text-loom-ink leading-relaxed">{body}</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>

        <footer className="border-t border-loom-line mt-14 pt-8 text-sm text-loom-indigoSoft space-y-1">
          <p className="text-loom-ink">
            <b>Nidhi Rakesh</b> · <b>Niveditha G. S.</b> · <b>Anjana Nandakumar</b>
          </p>
          <p>IIIT Kottayam · Girlathon, GDG On Campus MACE</p>
          <p>BharatNext: Building for Tier-2 and Tier-3 India</p>
          <div className="pt-2">
            <Button onClick={onSignIn} variant="ghost">
              {t("landOpen")}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
