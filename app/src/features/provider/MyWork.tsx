import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth";
import { pickLang } from "../../i18n";
import { Button, Card, Screen } from "../../ui";
import { apiGet, apiPost } from "../../lib/api";
import { SignOut } from "./Current";
import { RequestPattern } from "../shared/RequestPattern";

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
  isCoordinator: boolean;
  coordinatorSignedOffAt: string | null;
  coordinatorResponse: "pending" | "accepted" | "declined";
  coordinatorAppointedAt: string | null;
};

type MyTeam = {
  teamId: string;
  requestId: string;
  teamStatus: string;
  requestStatus: string | null;
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
  const { token, t, lang } = useAuth();
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
  const signOff = useMutation({
    mutationFn: (requestId: string) => apiPost("/api/requests/coordinator-signoff", { token, requestId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["requests/my-accepted", token] }),
  });
  const respondCoordinator = useMutation({
    mutationFn: (body: { requestId: string; accept: boolean }) =>
      apiPost("/api/requests/respond-coordinator", { token, ...body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["requests/my-accepted", token] }),
  });

  const statusLabel = (status: string) => t(`status_${status}`);

  // Grouped so an invitation awaiting a reply is not shown next to one already declined,
  // and so finished work reads as finished rather than sitting forever among active jobs.
  const invited = (teams ?? []).filter((tm) => tm.state === "invited");
  const joined = (teams ?? []).filter(
    (tm) => tm.state === "accepted" && tm.requestStatus !== "completed",
  );
  const doneTeam = (teams ?? []).filter(
    (tm) => tm.state === "accepted" && tm.requestStatus === "completed",
  );
  const activeIndividual = (accepted ?? []).filter((r) => r.status !== "completed" && r.mode === "individual");
  const doneIndividual = (accepted ?? []).filter((r) => r.status === "completed" && r.mode === "individual");
  // A coordinator-only row (appointed without ever applying) has interestState null and
  // belongs in its own section, not mixed into "applied and waiting" below.
  const activeGroup = (accepted ?? []).filter(
    (r) => r.status !== "completed" && r.mode === "group" && r.interestState !== null,
  );
  const doneGroup = (accepted ?? []).filter(
    (r) => r.status === "completed" && r.mode === "group" && r.interestState !== null,
  );
  const coordinating = (accepted ?? []).filter((r) => r.isCoordinator && r.status !== "completed");
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
                {pickLang(lang, tm.skill, tm.skillMl)} · {tm.coveredUnits} {t("units")}
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
            <div key={tm.teamId}>
              <Card className="mb-2">
                <div className="font-semibold text-loom-indigo">{tm.requestTitle}</div>
                <div className="text-sm text-loom-indigoSoft">
                  {pickLang(lang, tm.skill, tm.skillMl)} · {tm.coveredUnits} {t("units")} ·{" "}
                  {t(`status_${tm.requestStatus ?? tm.teamStatus}`)}
                </div>
              </Card>
              {/* Visible to her the same as it is to the coordinator and the customer — the
                  API already allowed any team member to read this, nothing on her own screen
                  ever showed it. canManage is false: only the coordinator adds or removes it. */}
              <RequestPattern requestId={tm.requestId} canManage={false} />
            </div>
          ))}
        </section>
      )}

      {activeIndividual.length > 0 && (
        <section>
          <h2 className="font-semibold text-loom-indigo mb-2">{t("individualWork")}</h2>
          {activeIndividual.map((r) => (
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

      {/* Group orders she applied to. Same two states as an individual application —
          'interested' means still waiting on the customer's open call to close, 'accepted'
          means she was one of the people picked — the open call just has room for more than
          one winner. */}
      {activeGroup.length > 0 && (
        <section>
          <h2 className="font-semibold text-loom-indigo mb-2">{t("groupWork")}</h2>
          {activeGroup.map((r) => (
            <div key={r._id}>
              <Card className="mb-2">
                <div className="font-semibold text-loom-indigo">{r.title}</div>
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
              {/* Only once she's actually on the job, not while still waiting to be picked —
                  and not if she's also the coordinator, whose own section above already shows
                  this with the manage controls she actually has. */}
              {r.interestState === "accepted" && !r.isCoordinator && (
                <RequestPattern requestId={r._id} canManage={false} />
              )}
            </div>
          ))}
        </section>
      )}

      {/* Group orders she is coordinating — appointed by the customer, which needs no
          application of her own (isCoordinator can be true with interestState null). She can
          attach the reference photo the whole team sees, and her sign-off is what
          requests/complete.ts is waiting on before the customer can close the job out. */}
      {coordinating.length > 0 && (
        <section>
          <h2 className="font-semibold text-loom-indigo mb-2">{t("coordinator")}</h2>
          {coordinating.map((r) => (
            <div key={r._id}>
              <Card className="mb-2">
                <div className="font-semibold text-loom-indigo">{r.title}</div>
                <div className="text-sm text-loom-indigoSoft">
                  {statusLabel(r.status)}
                  {r.pay !== null && ` · ₹${r.pay}`}
                  {` · ${r.units} ${t("units")}`}
                </div>
                {r.customerName && (
                  <div className="text-sm text-loom-indigoSoft mt-1">{r.customerName}</div>
                )}
                {/* Appointment is not automatic acceptance — she says yes or no before any
                    sign-off/pattern control appears, same as a team invitation. */}
                {r.coordinatorResponse === "pending" && (
                  <>
                    <p className="text-sm text-loom-indigoSoft mt-2">{t("coordinatorInviteBody")}</p>
                    <div className="flex gap-2 mt-2">
                      <Button
                        variant="leaf"
                        disabled={respondCoordinator.isPending}
                        onClick={() => respondCoordinator.mutate({ requestId: r._id, accept: true })}
                      >
                        {t("accept")}
                      </Button>
                      <Button
                        variant="danger"
                        disabled={respondCoordinator.isPending}
                        onClick={() => respondCoordinator.mutate({ requestId: r._id, accept: false })}
                      >
                        {t("decline")}
                      </Button>
                    </div>
                  </>
                )}
                {r.coordinatorResponse === "accepted" && r.status === "assigned" && (
                  <div className="mt-2">
                    {r.coordinatorSignedOffAt ? (
                      <span className="text-sm text-loom-leaf font-medium">{t("signedOff")}</span>
                    ) : (
                      <Button
                        variant="gold"
                        disabled={signOff.isPending}
                        onClick={() => {
                          if (window.confirm(t("confirmSignOff"))) signOff.mutate(r._id);
                        }}
                      >
                        {t("signOff")}
                      </Button>
                    )}
                  </div>
                )}
              </Card>
              {r.coordinatorResponse === "accepted" && r.status === "assigned" && (
                <RequestPattern requestId={r._id} canManage />
              )}
            </div>
          ))}
        </section>
      )}

      {/* Finished work. Nothing told a provider their job had ended: completion sets
          requests.status only, and the team card read the TEAM's status, which stays
          'confirmed' forever. */}
      {(doneTeam.length > 0 || doneIndividual.length > 0 || doneGroup.length > 0) && (
        <section>
          <h2 className="font-semibold text-loom-leaf mb-2">{t("completedWork")}</h2>
          {doneTeam.map((tm) => (
            <Card key={tm.teamId} className="mb-2">
              <div className="font-semibold text-loom-indigo">{tm.requestTitle}</div>
              <div className="text-sm text-loom-leaf font-medium">{t("workFinished")}</div>
              <div className="text-sm text-loom-indigoSoft">
                {pickLang(lang, tm.skill, tm.skillMl)} · {tm.coveredUnits} {t("units")}
              </div>
            </Card>
          ))}
          {[...doneIndividual, ...doneGroup].map((r) => (
            <Card key={r._id} className="mb-2">
              <div className="font-semibold text-loom-indigo">{r.title}</div>
              <div className="text-sm text-loom-leaf font-medium">{t("workFinished")}</div>
              <div className="text-sm text-loom-indigoSoft">
                {r.pay !== null && `₹${r.pay} · `}
                {r.units} {t("units")}
                {r.customerName && ` · ${r.customerName}`}
              </div>
            </Card>
          ))}
        </section>
      )}
    </Screen>
  );
}
