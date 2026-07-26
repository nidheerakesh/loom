import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../auth";
import { Button, Card, Field, Screen, Stars } from "../../ui";
import { SignOut } from "./Current";

type Readback = { raw: string; canonicalName: string | null; canonicalNameMl: string | null; matchedVia: string };

export function ProviderProfile() {
  const { token, t, me } = useAuth();
  const provider = me && me.role === "provider" ? me.provider : null;
  const skills = useQuery(api.skills.myProviderSkills, token ? { token } : "skip");
  const portfolio = useQuery(api.providers.myPortfolio, token ? { token } : "skip");
  const grievances = useQuery(api.grievances.mine, token ? { token } : "skip");

  const updateProfile = useMutation(api.providers.updateProfile);
  const setSkills = useAction(api.skills.addSkills);
  const genUpload = useMutation(api.providers.generateUploadUrl);
  const addPortfolio = useMutation(api.providers.addPortfolioItem);
  const submitGrievance = useMutation(api.grievances.submit);

  const [skillText, setSkillText] = useState("");
  const [readback, setReadback] = useState<Readback[] | null>(null);
  const [gSubject, setGSubject] = useState("");
  const [gBody, setGBody] = useState("");
  const [showGrievance, setShowGrievance] = useState(false);

  if (!provider || !token) return <Screen title={t("profile")} right={<SignOut />}><div /></Screen>;

  const saveField = (patch: Record<string, unknown>) => updateProfile({ token, ...patch });

  const addSkills = async () => {
    const phrases = skillText.split(",").map((s) => s.trim()).filter(Boolean);
    if (phrases.length === 0) return;
    const res = await setSkills({ token, phrases: [...(skills ?? []).map((s) => s.canonicalName), ...phrases] });
    setReadback(res.readback);
    setSkillText("");
  };

  const uploadImage = async (file: File) => {
    const url = await genUpload({ token });
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": file.type }, body: file });
    const { storageId } = await r.json();
    await addPortfolio({ token, storageId, caption: file.name });
  };

  return (
    <Screen title={t("profile")} right={<SignOut />}>
      <Card>
        <div className="flex items-center justify-between mb-2">
          <div className="font-bold text-lg text-loom-indigo">{provider.shopName ?? provider.name}</div>
          <Stars value={provider.rating} count={provider.ratingCount} />
        </div>
        <Field label={t("name")} defaultValue={provider.name} onBlur={(e) => saveField({ name: e.target.value })} />
        <Field label={t("shopName")} defaultValue={provider.shopName ?? ""} onBlur={(e) => saveField({ shopName: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("capacity")} type="number" defaultValue={provider.capacity} onBlur={(e) => saveField({ capacity: Number(e.target.value) })} />
          <Field label={t("experience")} type="number" defaultValue={provider.experienceYears} onBlur={(e) => saveField({ experienceYears: Number(e.target.value) })} />
          <Field label={t("rate")} type="number" defaultValue={provider.rate ?? ""} onBlur={(e) => saveField({ rate: Number(e.target.value) })} />
          <Field label={t("delivery")} type="number" defaultValue={provider.deliveryDays ?? ""} onBlur={(e) => saveField({ deliveryDays: Number(e.target.value) })} />
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold text-loom-indigo mb-2">{t("addSkills")}</h2>
        <div className="flex flex-wrap gap-1 mb-2">
          {skills?.map((s) => (
            <span key={s._id} className="bg-loom-indigo text-loom-cotton rounded-full px-3 py-1 text-sm">
              {s.iconKey} {s.canonicalNameMl ?? s.canonicalName}
            </span>
          ))}
        </div>
        <Field placeholder={t("skillsPlaceholder")} value={skillText} onChange={(e) => setSkillText(e.target.value)} />
        <Button className="w-full" onClick={addSkills}>🎤 {t("save")}</Button>
        {readback && (
          <div className="mt-3 text-sm space-y-1">
            <div className="font-semibold text-loom-indigo">{t("confirmSkills")}:</div>
            {readback.map((r, i) => (
              <div key={i} className={r.canonicalName ? "text-loom-leaf" : "text-loom-madder"}>
                "{r.raw}" → {r.canonicalName ? `${r.canonicalNameMl ?? r.canonicalName} (${r.matchedVia})` : "new skill — under review"}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold text-loom-indigo mb-2">{t("portfolio")}</h2>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {portfolio?.map((p) => (
            <div key={p._id} className="aspect-square bg-loom-cotton rounded-[14px] overflow-hidden">
              {p.url && <img src={p.url} alt={p.caption ?? ""} className="w-full h-full object-cover" />}
            </div>
          ))}
        </div>
        <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
      </Card>

      <Card>
        <button className="font-semibold text-loom-indigo" onClick={() => setShowGrievance((v) => !v)}>
          {t("grievance")} ▾
        </button>
        {showGrievance && (
          <div className="mt-2">
            <Field placeholder="Subject" value={gSubject} onChange={(e) => setGSubject(e.target.value)} />
            <Field placeholder="Details" value={gBody} onChange={(e) => setGBody(e.target.value)} />
            <Button
              variant="ghost"
              className="w-full"
              onClick={async () => {
                await submitGrievance({ token, subject: gSubject, body: gBody });
                setGSubject("");
                setGBody("");
              }}
            >
              {t("submit")}
            </Button>
            {grievances?.map((g) => (
              <div key={g._id} className="text-sm text-loom-indigoSoft mt-1">
                {g.subject} — {g.status}
              </div>
            ))}
          </div>
        )}
      </Card>
    </Screen>
  );
}
