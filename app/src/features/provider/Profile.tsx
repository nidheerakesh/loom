import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../auth";
import { Button, Card, Field, Screen, Stars } from "../../ui";
import { SignOut } from "./Current";
import { RoleSwitch } from "../shared/RoleSwitch";

type Readback = { raw: string; canonicalName: string | null; canonicalNameMl: string | null; matchedVia: string };
type SkillRow = { _id: string; canonicalName: string; canonicalNameMl: string | null; proficiency: number };
type PortfolioItem = { _id: string; url: string | null; caption: string | null };
type GrievanceRow = { _id: string; subject: string; body: string; status: string };

export function ProviderProfile() {
  const { token, t, me } = useAuth();
  const queryClient = useQueryClient();
  const provider = me && me.role === "provider" ? me.provider : null;

  const { data: grievances } = useQuery({
    queryKey: ["grievances/mine", token],
    queryFn: () => apiGet<GrievanceRow[]>("/api/grievances/mine", { token: token! }),
    enabled: !!token,
  });
  const submitGrievance = useMutation({
    mutationFn: (body: { subject: string; body: string }) => apiPost("/api/grievances/submit", { token, ...body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["grievances/mine", token] }),
  });

  const { data: skills } = useQuery({
    queryKey: ["mySkills", token],
    queryFn: () => apiGet<SkillRow[]>("/api/skills/mine", { token: token! }),
    enabled: !!token,
  });
  const { data: portfolio } = useQuery({
    queryKey: ["portfolio", token],
    queryFn: () => apiGet<PortfolioItem[]>("/api/providers/portfolio", { token: token! }),
    enabled: !!token,
  });
  const updateProfile = useMutation({
    mutationFn: (patch: Record<string, unknown>) => apiPost("/api/providers/update-profile", { token, ...patch }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me", token] }),
  });
  const addPortfolioItem = useMutation({
    mutationFn: (body: { path: string; caption: string }) =>
      apiPost("/api/providers/portfolio", { token, ...body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["portfolio", token] }),
  });

  const [skillText, setSkillText] = useState("");
  const [readback, setReadback] = useState<Readback[] | null>(null);
  const [gSubject, setGSubject] = useState("");
  const [gBody, setGBody] = useState("");
  const [showGrievance, setShowGrievance] = useState(false);

  if (!provider || !token) return <Screen title={t("profile")} right={<SignOut />}><div /></Screen>;

  const saveField = (patch: Record<string, unknown>) => updateProfile.mutate(patch);

  const addSkills = async () => {
    const phrases = skillText.split(",").map((s) => s.trim()).filter(Boolean);
    if (phrases.length === 0) return;
    const res = await apiPost<{ readback: Readback[] }>("/api/skills/resolve", {
      token,
      phrases: [...(skills ?? []).map((s) => s.canonicalName), ...phrases],
    });
    setReadback(res.readback);
    setSkillText("");
    queryClient.invalidateQueries({ queryKey: ["mySkills", token] });
  };

  const uploadImage = async (file: File) => {
    const { signedUrl, path } = await apiPost<{ signedUrl: string; path: string }>(
      "/api/providers/portfolio/upload-url",
      { token, fileName: file.name },
    );
    await fetch(signedUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
    addPortfolioItem.mutate({ path, caption: file.name });
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
              {s.canonicalNameMl ?? s.canonicalName}
            </span>
          ))}
        </div>
        <Field placeholder={t("skillsPlaceholder")} value={skillText} onChange={(e) => setSkillText(e.target.value)} />
        <Button className="w-full" onClick={addSkills}>{t("save")}</Button>
        {readback && (
          <div className="mt-3 text-sm space-y-1">
            <div className="font-semibold text-loom-indigo">{t("confirmSkills")}:</div>
            {readback.map((r, i) => (
              <div key={i} className={r.canonicalName ? "text-loom-leaf" : "text-loom-madder"}>
                "{r.raw}" → {r.canonicalName ? `${r.canonicalNameMl ?? r.canonicalName} (${r.matchedVia})` : t("newSkillAdded")}
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
            <Field placeholder={t("subject")} value={gSubject} onChange={(e) => setGSubject(e.target.value)} />
            <Field placeholder={t("details")} value={gBody} onChange={(e) => setGBody(e.target.value)} />
            <Button
              variant="ghost"
              className="w-full"
              onClick={async () => {
                await submitGrievance.mutateAsync({ subject: gSubject, body: gBody });
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
      <RoleSwitch />
    </Screen>
  );
}
