import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../auth";
import { Button, Card, Screen } from "../../ui";
import { SignOut } from "../provider/Current";

type MyRequest = {
  _id: string;
  title: string;
  mode: "individual" | "group";
  units: number;
  status: string;
  interestedCount: number;
  acceptedCount: number;
  teamId: string | null;
};
type TeamMember = {
  providerId: string;
  name: string;
  shopName: string | null;
  group: string | null;
  skill: string;
  skillMl: string | null;
  coveredUnits: number;
  state: string;
};
type TeamDetailData = {
  _id: string;
  status: string;
  rationale: string;
  complete: boolean;
  requestTitle: string;
  requestUnits: number;
  members: TeamMember[];
};

export function Accepted() {
  const { token, t } = useAuth();
  const queryClient = useQueryClient();
  const { data: requests } = useQuery({
    queryKey: ["customers/my-requests", token],
    queryFn: () => apiGet<MyRequest[]>("/api/customers/my-requests", { token: token! }),
    enabled: !!token,
  });
  const assemble = useMutation({
    mutationFn: (requestId: string) => apiPost("/api/team-assembly/assemble", { token, requestId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers/my-requests", token] }),
  });
  const [teamId, setTeamId] = useState<string | null>(null);

  if (teamId) return <TeamDetail teamId={teamId} onBack={() => setTeamId(null)} />;

  return (
    <Screen title={t("accepted")} right={<SignOut />}>
      {requests === undefined && <div className="text-loom-indigoSoft">…</div>}
      {requests && requests.length === 0 && <div className="text-loom-indigoSoft">{t("noResults")}</div>}
      {requests?.map((r) => (
        <Card key={r._id} className="mb-2">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-loom-indigo">{r.title}</div>
            <span className="text-xs bg-loom-cotton rounded-full px-2 py-1 text-loom-indigoSoft">{r.status}</span>
          </div>
          <div className="text-sm text-loom-indigoSoft">
            {r.mode} · {r.units} {t("units")} · ✋{r.interestedCount} · ✓{r.acceptedCount}
          </div>
          <div className="flex gap-2 mt-2">
            {r.mode === "group" && !r.teamId && token && (
              <Button variant="gold" onClick={() => assemble.mutate(r._id)}>
                🧵 {t("assembleTeam")}
              </Button>
            )}
            {r.teamId && <Button onClick={() => setTeamId(r.teamId!)}>{t("teams")}</Button>}
          </div>
        </Card>
      ))}
    </Screen>
  );
}

function TeamDetail({ teamId, onBack }: { teamId: string; onBack: () => void }) {
  const { token, t } = useAuth();
  const queryClient = useQueryClient();
  const { data: team } = useQuery({
    queryKey: ["team-assembly/get", teamId],
    queryFn: () => apiGet<TeamDetailData>("/api/team-assembly/get", { teamId }),
  });
  const confirm = useMutation({
    mutationFn: () => apiPost("/api/team-assembly/confirm", { token, teamId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-assembly/get", teamId] }),
  });
  const rate = useMutation({
    mutationFn: (body: { providerId: string; stars: number }) => apiPost("/api/ratings/rate", { token, ...body }),
  });

  return (
    <Screen title={t("teams")} right={<button onClick={onBack} className="text-loom-indigo">‹ back</button>}>
      {!team ? (
        <div className="text-loom-indigoSoft">…</div>
      ) : (
        <>
          <Card>
            <div className="font-bold text-loom-indigo">{team.requestTitle}</div>
            <div className={`text-sm ${team.complete ? "text-loom-leaf" : "text-loom-madder"}`}>
              {team.complete ? "✓ coverage complete" : "coverage incomplete"} · {team.status}
            </div>
            <div className="text-sm text-loom-indigoSoft mt-1">{team.rationale}</div>
          </Card>
          {team.members.map((m, i) => (
            <Card key={`${m.providerId}-${m.skill}-${i}`} className="mb-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-loom-indigo">{m.shopName ?? m.name}</div>
                  <div className="text-sm text-loom-indigoSoft">
                    {m.group ?? "—"} · {m.skillMl ?? m.skill} · {m.coveredUnits} {t("units")} · {m.state}
                  </div>
                </div>
                {token && (
                  <Button variant="ghost" onClick={() => rate.mutate({ providerId: m.providerId, stars: 5 })}>
                    ★ {t("rateProvider")}
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {token && team.status === "proposed" && (
            <Button variant="leaf" className="w-full" onClick={() => confirm.mutate()}>
              ✓ {t("confirmTeam")}
            </Button>
          )}
        </>
      )}
    </Screen>
  );
}
