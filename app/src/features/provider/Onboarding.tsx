import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, ApiError } from "../../lib/api";
import { pickLang } from "../../i18n";
import { useAuth } from "../../auth";
import { LocationPicker } from "../shared/LocationPicker";
import { Button, Card, Field, ListenButton, TextButton } from "../../ui";

type Readback = {
  raw: string;
  canonicalName: string | null;
  canonicalNameMl: string | null;
  matchedVia: string;
};

// Shown once, to a provider who has just signed up and has no skills yet. Without at least
// one skill a provider cannot appear in any skill-filtered search, so the account would exist
// but be invisible — this is the step that makes them findable.
//
// Deliberately reuses the same endpoints the Profile screen uses (skills/resolve,
// skills/mine, providers/update-profile) rather than adding onboarding-only routes.
export function ProviderOnboarding({ onDone }: { onDone: () => void }) {
  const { token, t, lang } = useAuth();
  const queryClient = useQueryClient();

  const [skillText, setSkillText] = useState("");
  const [readback, setReadback] = useState<Readback[] | null>(null);
  const [rate, setRate] = useState("");
  const [experience, setExperience] = useState("");
  const [delivery, setDelivery] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resolveSkills = useMutation({
    mutationFn: (phrases: string[]) =>
      apiPost<{ readback: Readback[] }>("/api/skills/resolve", { token, phrases }),
  });

  const preview = async () => {
    const phrases = skillText.split(",").map((s) => s.trim()).filter(Boolean);
    if (phrases.length === 0) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await resolveSkills.mutateAsync(phrases);
      setReadback(res.readback);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      const patch: Record<string, unknown> = { token };
      const rateNum = Number(rate);
      const expNum = Number(experience);
      if (rate.trim() && Number.isFinite(rateNum)) {
        patch.rate = rateNum;
        patch.rateUnit = "piece";
      }
      if (experience.trim() && Number.isFinite(expNum)) patch.experienceYears = expNum;
      // Never asked for before, so every provider who signed up through the app had none and
      // her card rendered an empty delivery field where the seeded rows showed a number.
      const dayNum = Number(delivery);
      if (delivery.trim() && Number.isFinite(dayNum) && dayNum > 0) patch.deliveryDays = dayNum;
      if (Object.keys(patch).length > 1) {
        await apiPost("/api/providers/update-profile", patch);
      }
      await queryClient.invalidateQueries({ queryKey: ["me", token] });
      await queryClient.invalidateQueries({ queryKey: ["mySkills", token] });
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
      setBusy(false);
    }
  };

  const confirmed = readback?.some((r) => r.canonicalName) ?? false;

  return (
    <div className="max-w-[520px] mx-auto min-h-screen bg-loom-cotton p-6 flex flex-col justify-center">
      <div className="text-center mb-6">
        <div className="text-2xl font-bold text-loom-indigo">{t("setUpProfile")}</div>
        <div className="text-loom-indigoSoft text-sm mt-1">{t("setUpProfileHint")}</div>
      </div>

      <Card>
        <Field
          label={t("addSkills")}
          value={skillText}
          autoFocus
          placeholder={t("skillsPlaceholder")}
          onChange={(e) => {
            setSkillText(e.target.value);
            setReadback(null);
          }}
        />

        {!readback && (
          <Button className="w-full" onClick={() => void preview()} disabled={!skillText.trim() || busy}>
            {t("confirmSkills")}
          </Button>
        )}

        {readback && (
          <div className="mb-4 space-y-1">
            {/* USER_FLOWS §2: the canonical read-back is meant to be heard, not just shown. */}
            <div className="flex justify-end">
              <ListenButton
                text={readback
                  .filter((r) => r.canonicalName)
                  .map((r) => pickLang(lang, r.canonicalName, r.canonicalNameMl))
                  .join(", ")}
              />
            </div>
            {readback.map((r, i) => (
              <div key={i} className="text-sm">
                {r.canonicalName ? (
                  <span className="text-loom-indigo">
                    {r.raw} → <b>{pickLang(lang, r.canonicalName, r.canonicalNameMl)}</b>
                  </span>
                ) : (
                  <span className="text-loom-madder">
                    {r.raw} — {t("skillNotRecognised")}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {readback && (
          <>
            <Field
              label={t("rate")}
              value={rate}
              inputMode="numeric"
              placeholder="300"
              onChange={(e) => setRate(e.target.value)}
            />
            <Field
              label={t("experience")}
              value={experience}
              inputMode="numeric"
              placeholder="5"
              onChange={(e) => setExperience(e.target.value)}
            />
            <Field
              label={t("deliveryDaysLabel")}
              value={delivery}
              inputMode="numeric"
              placeholder="3"
              onChange={(e) => setDelivery(e.target.value)}
            />
            {/* Asked here rather than left to a hash of her phone number, which is what
                assigned it before — distances were arithmetic over coordinates that meant
                nothing. Skipping is still allowed; she keeps the assigned area until she says
                otherwise, so onboarding never becomes a wall. */}
            <div className="mb-3">
              <div className="text-sm font-medium text-loom-indigo mb-1">{t("yourArea")}</div>
              <LocationPicker />
            </div>
            <Button className="w-full" onClick={() => void save()} disabled={busy || !confirmed}>
              {t("finish")}
            </Button>
            <TextButton className="mt-3 w-full" onClick={onDone} disabled={busy}>
              {t("skipForNow")}
            </TextButton>
          </>
        )}

        {err && <div className="mt-3 text-loom-madder text-sm">{err}</div>}
      </Card>
    </div>
  );
}
