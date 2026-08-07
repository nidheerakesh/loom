import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../auth";
import { Button, Card, Field, Screen } from "../../ui";
import { SignOut } from "../provider/Current";

type SkillOption = { _id: string; canonicalName: string; canonicalNameMl: string | null };

export function RequestForm({ onDone }: { onDone: () => void }) {
  const { token, t } = useAuth();
  const { data: skills } = useQuery({ queryKey: ["skills"], queryFn: () => apiGet<SkillOption[]>("/api/skills/list") });
  const create = useMutation({
    mutationFn: (body: {
      title: string;
      description: string;
      mode: "individual" | "group";
      units: number;
      pay: number | undefined;
      skills: { skillId: string; quantity: number }[];
    }) => apiPost<{ requestId: string; teamSuggested: boolean }>("/api/requests/create", { token, ...body }),
  });
  const assemble = useMutation({
    mutationFn: (requestId: string) => apiPost("/api/team-assembly/assemble", { token, requestId }),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<"individual" | "group">("individual");
  const [units, setUnits] = useState(1);
  const [pay, setPay] = useState<number | "">("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState<{ requestId: string; group: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
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
        pay: pay === "" ? undefined : Number(pay),
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
          {created.group ? (
            <>
              <div className="text-sm text-loom-indigoSoft mb-2">This is a team order.</div>
              <Button
                variant="gold"
                className="w-full"
                onClick={async () => {
                  if (token) await assemble.mutateAsync(created.requestId);
                  onDone();
                }}
              >
                {t("assembleTeam")}
              </Button>
            </>
          ) : (
            <Button className="w-full" onClick={onDone}>OK</Button>
          )}
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
        <div className="flex flex-wrap gap-1 mb-3">
          {skills?.map((s) => (
            <button
              key={s._id}
              onClick={() => toggle(s._id)}
              className={`rounded-full px-3 py-2 text-sm ${selected.has(s._id) ? "bg-loom-indigo text-loom-cotton" : "bg-loom-cottonDeep text-loom-indigo"}`}
            >
              {s.canonicalNameMl ?? s.canonicalName}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mb-3">
          <Button variant={mode === "individual" ? "primary" : "ghost"} className="flex-1" onClick={() => setMode("individual")}>
            {t("individual")}
          </Button>
          <Button variant={mode === "group" ? "primary" : "ghost"} className="flex-1" onClick={() => setMode("group")}>
            {t("group")}
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("units")} type="number" value={units} onChange={(e) => setUnits(Number(e.target.value))} />
          <Field label={`${t("price")} ₹`} type="number" value={pay} onChange={(e) => setPay(e.target.value === "" ? "" : Number(e.target.value))} />
        </div>
        <Button className="w-full" onClick={submit} disabled={!title || selected.size === 0}>
          {t("submit")}
        </Button>
        {err && <div className="text-loom-madder text-sm mt-2">{err}</div>}
      </Card>
    </Screen>
  );
}
