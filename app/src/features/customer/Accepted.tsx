import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "../../auth";
import { Button, Card, Screen } from "../../ui";
import { SignOut } from "../provider/Current";

export function Accepted() {
  const { token, t } = useAuth();
  const requests = useQuery(api.customers.myRequests, token ? { token } : "skip");
  const assemble = useMutation(api.teamAssembly.assemble);
  const [teamId, setTeamId] = useState<Id<"teams"> | null>(null);

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
              <Button variant="gold" onClick={() => assemble({ token, requestId: r._id })}>
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

function TeamDetail({ teamId, onBack }: { teamId: Id<"teams">; onBack: () => void }) {
  const { token, t } = useAuth();
  const team = useQuery(api.teamAssembly.getTeam, { teamId });
  const confirm = useMutation(api.teamAssembly.confirm);
  const rate = useMutation(api.ratings.rate);

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
                  <Button variant="ghost" onClick={() => rate({ token, providerId: m.providerId, stars: 5 })}>
                    ★ {t("rateProvider")}
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {token && team.status === "proposed" && (
            <Button variant="leaf" className="w-full" onClick={() => confirm({ token, teamId })}>
              ✓ {t("confirmTeam")}
            </Button>
          )}
        </>
      )}
    </Screen>
  );
}
