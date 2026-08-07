import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth";
import { Button, Card, Screen } from "../../ui";
import { apiGet, apiPost } from "../../lib/api";
import { SignOut } from "./Current";

type AcceptedRequest = {
  _id: string;
  title: string;
  units: number;
  pay: number | null;
  status: string;
  mode: string;
  customerName: string | null;
  distanceKm: number | null;
  interestState: "interested" | "accepted" | null;
};

type MyTeam = {
  teamId: string;
  teamStatus: string;
  requestTitle: string;
  skill: string;
  skillMl: string | null;
  coveredUnits: number;
  state: string;
};

// Work this provider has taken on — individual jobs they accepted, and teams they are on.
//
// Previously unreachable. Accepting a request marks it 'assigned', and every provider-facing
// list filters to 'open', so an accepted job disappeared entirely; team memberships were only
// visible as an unlabelled block above the "Find work" feed, mixed in with declined ones.
export function ProviderMyWork() {
  const { token, t } = useAuth();
  const queryClient = useQueryClient();

  const { data: accepted } = useQuery({
    queryKey: ["requests/my-accepted", token],
    queryFn: () => apiGet<AcceptedRequest[]>("/api/requests/my-accepted", { token: token! }),
    enabled: !!token,
  });
  const { data: teams } = useQuery({
    queryKey: ["team-assembly/my-teams", token],
    queryFn: () => apiGet<MyTeam[]>("/api/team-assembly/my-teams", { token: token! }),
    enabled: !!token,
  });
  const respondInvite = useMutation({
    mutationFn: (body: { teamId: string; accept: boolean }) =>
      apiPost("/api/team-assembly/respond-invite", { token, ...body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-assembly/my-teams", token] }),
  });

  const statusLabel = (status: string) => t(`status_${status}`);

  // Grouped so an invitation awaiting a reply is not shown next to one already declined.
  const invited = (teams ?? []).filter((tm) => tm.state === "invited");
  const joined = (teams ?? []).filter((tm) => tm.state === "accepted");
  const loading = accepted === undefined || teams === undefined;
  const empty = !loading && (accepted?.length ?? 0) === 0 && (teams?.length ?? 0) === 0;

  return (
    <Screen title={t("myWork")} right={<SignOut />}>
      {loading && <div className="text-loom-indigoSoft">…</div>}
      {empty && <div className="text-loom-indigoSoft">{t("noAcceptedWork")}</div>}

      {invited.length > 0 && (
        <section>
          <h2 className="font-semibold text-loom-indigo mb-2">{t("teamInvites")}</h2>
          {invited.map((tm) => (
            <Card key={tm.teamId} className="mb-2">
              <div className="font-semibold text-loom-indigo">{tm.requestTitle}</div>
              <div className="text-sm text-loom-indigoSoft">
                {tm.skillMl ?? tm.skill} · {tm.coveredUnits} {t("units")}
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  variant="leaf"
                  onClick={() => respondInvite.mutate({ teamId: tm.teamId, accept: true })}
                >
                  {t("accept")}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => respondInvite.mutate({ teamId: tm.teamId, accept: false })}
                >
                  {t("decline")}
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      {joined.length > 0 && (
        <section>
          <h2 className="font-semibold text-loom-indigo mb-2">{t("teamWork")}</h2>
          {joined.map((tm) => (
            <Card key={tm.teamId} className="mb-2">
              <div className="font-semibold text-loom-indigo">{tm.requestTitle}</div>
              <div className="text-sm text-loom-indigoSoft">
                {tm.skillMl ?? tm.skill} · {tm.coveredUnits} {t("units")} ·{" "}
                {t(`status_${tm.teamStatus}`)}
              </div>
            </Card>
          ))}
        </section>
      )}

      {(accepted?.length ?? 0) > 0 && (
        <section>
          <h2 className="font-semibold text-loom-indigo mb-2">{t("individualWork")}</h2>
          {accepted?.map((r) => (
            <Card key={r._id} className="mb-2">
              <div className="font-semibold text-loom-indigo">{r.title}</div>
              {/* Applying no longer wins the job — the customer picks between everyone who
                  applied — so say plainly which of the two states this is. */}
              <div
                className={`text-sm font-medium ${
                  r.interestState === "accepted" ? "text-loom-leaf" : "text-loom-turmeric"
                }`}
              >
                {r.interestState === "accepted" ? t("status_accepted") : t("waitingForCustomer")}
              </div>
              <div className="text-sm text-loom-indigoSoft">
                {statusLabel(r.status)}
                {r.pay !== null && ` · ₹${r.pay}`}
                {` · ${r.units} ${t("units")}`}
                {r.distanceKm !== null && ` · ${r.distanceKm} ${t("km")}`}
              </div>
              {r.customerName && (
                <div className="text-sm text-loom-indigoSoft mt-1">{r.customerName}</div>
              )}
            </Card>
          ))}
        </section>
      )}
    </Screen>
  );
}
