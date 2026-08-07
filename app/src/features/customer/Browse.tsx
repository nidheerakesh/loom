import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../auth";
import { Button, Card, Screen, Stars } from "../../ui";
import { SignOut } from "../provider/Current";
import { ChatThread } from "../shared/Communities";

const EXP_TIERS = [0, 1, 3, 5];
const DIST = [0, 3, 5, 10];
const RATES = [0, 400, 500, 700];

type SkillOption = { _id: string; canonicalName: string; canonicalNameMl: string | null };
type ProviderCard = {
  _id: string;
  name: string;
  shopName: string | null;
  capacity: number;
  rate: number | null;
  rateUnit: string | null;
  deliveryDays: number | null;
  experienceYears: number;
  rating: number;
  ratingCount: number;
  distanceKm: number | null;
  skills: { _id: string; canonicalName: string; canonicalNameMl: string | null }[];
};
type ProviderProfile = ProviderCard & {
  portfolio: { _id: string; url: string | null; caption: string | null }[];
  reviews: { stars: number; comment: string | null }[];
};

export function Browse() {
  const { token, t } = useAuth();
  const { data: skills } = useQuery({ queryKey: ["skills"], queryFn: () => apiGet<SkillOption[]>("/api/skills/list") });
  const [skillId, setSkillId] = useState<string | undefined>(undefined);
  const [maxDistanceKm, setMaxDistanceKm] = useState(0);
  const [minExperience, setMinExperience] = useState(0);
  const [maxRate, setMaxRate] = useState(0);

  const { data: results } = useQuery({
    queryKey: ["providers/search", token, skillId, maxDistanceKm, minExperience, maxRate],
    queryFn: () =>
      apiGet<ProviderCard[]>("/api/providers/search", {
        token: token!,
        skillId,
        maxDistanceKm: maxDistanceKm ? String(maxDistanceKm) : undefined,
        minExperience: minExperience ? String(minExperience) : undefined,
        maxRate: maxRate ? String(maxRate) : undefined,
      }),
    enabled: !!token,
  });

  const [profileId, setProfileId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);

  if (chatId) return <ChatThread threadId={chatId} onBack={() => setChatId(null)} />;
  if (profileId) return <ProviderDetail providerId={profileId} onBack={() => setProfileId(null)} onChat={setChatId} />;

  return (
    <Screen title={t("browse")} right={<SignOut />}>
      <div className="flex gap-1 overflow-x-auto pb-2">
        <Chip active={!skillId} label={t("anySkill")} onClick={() => setSkillId(undefined)} />
        {skills?.map((s) => (
          <Chip key={s._id} active={skillId === s._id} label={s.canonicalNameMl ?? s.canonicalName} onClick={() => setSkillId(s._id)} />
        ))}
      </div>
      <div className="space-y-2">
        <FilterRow label={t("distance")} options={DIST} value={maxDistanceKm} unit={t("km")} onChange={setMaxDistanceKm} />
        <FilterRow label={t("experience")} options={EXP_TIERS} value={minExperience} unit={"+" + t("yrs")} onChange={setMinExperience} />
        <FilterRow label={t("price")} options={RATES} value={maxRate} unit="≤₹" onChange={setMaxRate} prefixUnit />
      </div>

      <div className="mt-3 space-y-2">
        {results === undefined && <div className="text-loom-indigoSoft">…</div>}
        {results && results.length === 0 && <div className="text-loom-indigoSoft">{t("noResults")}</div>}
        {results?.map((p) => (
          <Card key={p._id} className="cursor-pointer" >
            <button className="text-left w-full" onClick={() => setProfileId(p._id)}>
              <div className="flex items-center justify-between">
                <div className="font-semibold text-loom-indigo">{p.shopName ?? p.name}</div>
                <Stars value={p.rating} count={p.ratingCount} />
              </div>
              <div className="text-sm text-loom-indigoSoft">
                {p.rate ? `₹${p.rate}/${p.rateUnit ?? ""}` : "—"} · {p.deliveryDays ?? "?"}d · {p.experienceYears}
                {t("yrs")}
                {p.distanceKm !== null ? ` · ${p.distanceKm} ${t("km")}` : ""} · {p.capacity} {t("people")}
              </div>
              <div className="text-sm mt-1 text-loom-indigoSoft">{p.skills.map((s) => s.canonicalNameMl ?? s.canonicalName).join(" · ")}</div>
            </button>
          </Card>
        ))}
      </div>
    </Screen>
  );
}

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-2 text-sm ${active ? "bg-loom-indigo text-loom-cotton" : "bg-loom-cottonDeep text-loom-indigo"}`}
    >
      {label}
    </button>
  );
}

function FilterRow({
  label,
  options,
  value,
  unit,
  prefixUnit,
  onChange,
}: {
  label: string;
  options: number[];
  value: number;
  unit: string;
  prefixUnit?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="text-sm text-loom-indigoSoft mb-1">{label}</div>
      <div className="flex gap-1">
        {options.map((o) => (
          <Chip
            key={o}
            active={value === o}
            label={o === 0 ? "Any" : prefixUnit ? `${unit}${o}` : `${o}${unit}`}
            onClick={() => onChange(o)}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderDetail({
  providerId,
  onBack,
  onChat,
}: {
  providerId: string;
  onBack: () => void;
  onChat: (id: string) => void;
}) {
  const { token, t } = useAuth();
  const { data: p } = useQuery({
    queryKey: ["providers/get", providerId],
    queryFn: () => apiGet<ProviderProfile>("/api/providers/get", { providerId }),
  });
  const openThread = useMutation({
    mutationFn: (title: string) =>
      apiPost<string>("/api/chat/threads", { token, contextType: "provider", contextId: providerId, title }),
  });

  const startChat = async () => {
    if (!token || !p) return;
    const id = await openThread.mutateAsync(p.shopName ?? p.name);
    onChat(id);
  };

  return (
    <Screen title={t("profile")} right={<button onClick={onBack} className="text-loom-indigo">‹ back</button>}>
      {!p ? (
        <div className="text-loom-indigoSoft">…</div>
      ) : (
        <>
          <Card>
            <div className="flex items-center justify-between">
              <div className="font-bold text-lg text-loom-indigo">{p.shopName ?? p.name}</div>
              <Stars value={p.rating} count={p.ratingCount} />
            </div>
            <div className="text-sm text-loom-indigoSoft mt-1">
              {p.rate ? `₹${p.rate}/${p.rateUnit ?? ""}` : "—"} · {p.deliveryDays ?? "?"}d · {p.experienceYears}
              {t("yrs")} · {p.capacity} {t("people")}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.skills.map((s) => (
                <span key={s._id} className="bg-loom-indigo text-loom-cotton rounded-full px-3 py-1 text-sm">
                  {s.canonicalNameMl ?? s.canonicalName}
                </span>
              ))}
            </div>
          </Card>
          {p.portfolio.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {p.portfolio.map((it) => (
                <div key={it._id} className="aspect-square bg-loom-cottonDeep rounded-[14px] overflow-hidden">
                  {it.url && <img src={it.url} className="w-full h-full object-cover" />}
                </div>
              ))}
            </div>
          )}
          <Button variant="gold" className="w-full" onClick={startChat}>{t("chat")}</Button>
          {p.reviews.length > 0 && (
            <Card>
              {p.reviews.map((r, i) => (
                <div key={i} className="text-sm">
                  <Stars value={r.stars} /> {r.comment}
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
