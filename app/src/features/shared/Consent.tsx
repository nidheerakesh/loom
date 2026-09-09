import { useState } from "react";
import { useAuth } from "../../auth";
import { Button, ListenButton, TextButton } from "../../ui";

// Shown once, between the code she just verified and the name/role form that would otherwise
// come right after it — asking for her name before saying what happens to it is backwards.
// Only reachable on a brand-new number; a returning one skips straight past this screen
// because SignIn.tsx never routes her through it.
//
// A fragment rather than its own `Screen` — SignIn.tsx already owns the page shell (logo,
// language toggle, Card) and every other step in that flow is inlined the same way, so this
// matches rather than nesting a second header inside the first.
//
// `agreed` starts false and is only ever set by her own tap — never derived from anything
// (not "true because she got this far", not pre-ticked) — because a checkbox that starts
// ticked is not consent, it's a default she has to notice and undo.
export function Consent({ onAgree, onBack }: { onAgree: () => void; onBack: () => void }) {
  const { t } = useAuth();
  const [agreed, setAgreed] = useState(false);

  const bodyText = [t("consentWhat"), t("consentWho"), t("consentDelete")].join(" ");

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="text-loom-indigo font-medium">{t("consentTitle")}</div>
        <ListenButton text={bodyText} />
      </div>
      <p className="text-loom-ink leading-relaxed mb-3">{t("consentWhat")}</p>
      <p className="text-loom-ink leading-relaxed mb-3">{t("consentWho")}</p>
      <p className="text-loom-ink leading-relaxed mb-4">{t("consentDelete")}</p>

      <label className="flex items-start gap-3 mb-4 cursor-pointer">
        <input
          type="checkbox"
          className="w-6 h-6 mt-0.5 flex-shrink-0"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span className="text-loom-ink">{t("consentAgree")}</span>
      </label>

      <Button className="w-full" disabled={!agreed} onClick={onAgree}>
        {t("continue")}
      </Button>
      <TextButton className="mt-3 w-full" onClick={onBack}>
        ‹ {t("back")}
      </TextButton>
    </>
  );
}
