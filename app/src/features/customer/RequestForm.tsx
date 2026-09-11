import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { pickLang } from "../../i18n";
import { useAuth } from "../../auth";
import { Button, Card, Field, Screen } from "../../ui";
import { SignOut } from "../provider/Current";

type SkillOption = { _id: string; canonicalName: string; canonicalNameMl: string | null };
type ResolvedSkill = { skillId: string; canonicalName: string; canonicalNameMl: string | null; matchedVia: string };

// Coordinator is deliberately not asked here. At creation time she doesn't yet know who is
// actually on the team — that's the whole point of the open call — so appointing someone is a
// step that belongs after staffing (Accepted.tsx's finalize step), not before it.
export function RequestForm({ onDone }: { onDone: () => void }) {
  const { token, t, lang } = useAuth();
  const { data: skills } = useQuery({ queryKey: ["skills"], queryFn: () => apiGet<SkillOption[]>("/api/skills/list") });
  const create = useMutation({
    mutationFn: (body: {
      title: string;
      description: string;
      mode: "individual" | "group";
      units: number;
      pay: number | undefined;
      headcount: number | undefined;
      interestDeadline: string | undefined;
      agreedRate: number | undefined;
      agreedRateUnit: string | undefined;
      skills: { skillId: string; quantity: number }[];
    }) => apiPost<{ requestId: string; teamSuggested: boolean }>("/api/requests/create", { token, ...body }),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"individual" | "group">("individual");
  const [units, setUnits] = useState(1);
  const [pay, setPay] = useState<number | "">("");
  const [headcount, setHeadcount] = useState<number | "">("");
  // <input type="datetime-local"> has no timezone of its own — this is read back as local time
  // and sent to the server as a plain ISO string, which is what respond.ts compares against
  // Date.now(). Good enough for a single-cluster deployment; not something to get clever about
  // before Friday.
  const [interestDeadline, setInterestDeadline] = useState("");
  // Same `agreed_rate` column the finalize step later locks in — here it's only what she
  // expects to pay, shown to applicants as a number to weigh their own rate against, not a
  // promise. She (or the coordinator) sets the real figure once the team exists.
  const [expectedPrice, setExpectedPrice] = useState<number | "">("");
  const [expectedPriceUnit, setExpectedPriceUnit] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // A skill she just resolved by typing, not from the pre-loaded list — shown alongside the
  // catalogue as its own chip so she can see it's selected, without waiting on skills/list's
  // query to refetch (which would also silently include it for every OTHER customer's form).
  const [customSkills, setCustomSkills] = useState<Map<string, ResolvedSkill>>(new Map());
  const [customSkillText, setCustomSkillText] = useState("");
  const [customSkillErr, setCustomSkillErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ requestId: string; group: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const addCustomSkill = async () => {
    const phrase = customSkillText.trim();
    if (!phrase || !token) return;
    setCustomSkillErr(null);
    try {
      const resolved = await apiPost<ResolvedSkill>("/api/skills/find-or-create", { token, phrase });
      setCustomSkills((prev) => new Map(prev).set(resolved.skillId, resolved));
      setSelected((prev) => new Set(prev).add(resolved.skillId));
      setCustomSkillText("");
    } catch (e) {
      setCustomSkillErr(String(e));
    }
  };

  const submit = async () => {
    if (!token) return;
    setErr(null);
    try {
      const res = await create.mutateAsync({
        title,
        description,
        mode,
        units,
        pay:
          mode === "group"
            ? expectedPrice === "" ? undefined : Number(expectedPrice)
            : pay === "" ? undefined : Number(pay),
        headcount: mode === "group" && headcount !== "" ? headcount : undefined,
        interestDeadline:
          mode === "group" && interestDeadline ? new Date(interestDeadline).toISOString() : undefined,
        agreedRate: mode === "group" && expectedPrice !== "" ? expectedPrice : undefined,
        agreedRateUnit: mode === "group" && expectedPriceUnit.trim() ? expectedPriceUnit.trim() : undefined,
        skills: [...selected].map((skillId) => ({ skillId, quantity: units })),
      });
      setCreated({ requestId: res.requestId, group: res.teamSuggested });
    } catch (e) {
      setErr(String(e));
    }
  };

  if (created) {
    return (
      <Screen title={t("request")} right={<SignOut />}>
        <Card>
          <div className="text-loom-leaf font-semibold mb-2">{title}</div>
          {created.group && (
            <div className="text-sm text-loom-indigoSoft mb-2">{t("teamOrderNotice")}</div>
          )}
          <Button className="w-full" onClick={onDone}>{t("ok")}</Button>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title={t("newRequest")} right={<SignOut />}>
      <Card>
        <Field label={t("description")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="200 uniforms" />
        <Field value={description} onChange={(e) => setDescription(e.target.value)} placeholder="details…" />
        <div className="text-sm text-loom-indigoSoft mb-1">{t("addSkills")}</div>
        <div className="flex flex-wrap gap-1 mb-2">
          {skills?.map((s) => (
            <button
              key={s._id}
              onClick={() => toggle(s._id)}
              className={`rounded-full px-3 py-2 text-sm ${selected.has(s._id) ? "bg-loom-indigo text-loom-cotton" : "bg-loom-cottonDeep text-loom-indigo"}`}
            >
              {pickLang(lang, s.canonicalName, s.canonicalNameMl)}
            </button>
          ))}
          {/* A skill she named herself, not on the list above — kept separate from `skills`
              (which is one shared query for every customer) so it appears here immediately
              without waiting on a refetch, and without leaking into anyone else's form. */}
          {[...customSkills.values()].map((cs) => (
            <button
              key={cs.skillId}
              onClick={() => toggle(cs.skillId)}
              className={`rounded-full px-3 py-2 text-sm ${selected.has(cs.skillId) ? "bg-loom-indigo text-loom-cotton" : "bg-loom-cottonDeep text-loom-indigo"}`}
            >
              {pickLang(lang, cs.canonicalName, cs.canonicalNameMl)}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mb-1">
          <div className="flex-1">
            <Field
              className="mb-0"
              value={customSkillText}
              onChange={(e) => setCustomSkillText(e.target.value)}
              placeholder={t("skillNotListedPlaceholder")}
            />
          </div>
          <Button variant="ghost" disabled={!customSkillText.trim()} onClick={() => void addCustomSkill()}>
            {t("addSkillButton")}
          </Button>
        </div>
        {customSkillErr && <div className="text-loom-madder text-sm mb-3">{customSkillErr}</div>}
        <div className="flex gap-2 mb-3">
          <Button variant={mode === "individual" ? "primary" : "ghost"} className="flex-1" onClick={() => setMode("individual")}>
            {t("individual")}
          </Button>
          <Button variant={mode === "group" ? "primary" : "ghost"} className="flex-1" onClick={() => setMode("group")}>
            {t("group")}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {/* The server enforces the same bounds — a number input is a suggestion, not a
              constraint — but clamping here means the form cannot show an illegal value. */}
          <Field label={t("units")} type="number" min={1} max={10000} value={units}
            onChange={(e) => setUnits(Math.min(10000, Math.max(1, Math.floor(Number(e.target.value)) || 1)))} />
          {mode === "individual" && (
            <Field label={`${t("price")} ₹`} type="number" value={pay} onChange={(e) => setPay(e.target.value === "" ? "" : Number(e.target.value))} />
          )}
        </div>
        {mode === "group" && (
          <div className="grid grid-cols-2 gap-2">
            <Field
              label={t("headcountOptional")}
              type="number"
              min={1}
              max={1000}
              value={headcount}
              onChange={(e) =>
                setHeadcount(e.target.value === "" ? "" : Math.max(1, Math.floor(Number(e.target.value)) || 1))
              }
            />
            <Field
              label={t("interestDeadline")}
              type="datetime-local"
              value={interestDeadline}
              onChange={(e) => setInterestDeadline(e.target.value)}
            />
          </div>
        )}
        {mode === "group" && (
          <div className="grid grid-cols-2 gap-2">
            <Field
              label={t("expectedPrice")}
              type="number"
              value={expectedPrice}
              onChange={(e) => setExpectedPrice(e.target.value === "" ? "" : Number(e.target.value))}
            />
            <Field
              label={t("agreedRateUnit")}
              placeholder="piece"
              value={expectedPriceUnit}
              onChange={(e) => setExpectedPriceUnit(e.target.value)}
            />
          </div>
        )}
        <Button className="w-full" onClick={() => void submit()} disabled={!title || selected.size === 0}>
          {t("submit")}
        </Button>
        {err && <div className="text-loom-madder text-sm mt-2">{err}</div>}
      </Card>
    </Screen>
  );
}
