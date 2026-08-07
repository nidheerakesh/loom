import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../auth";
import { Button, Card, Field, Screen, Stars } from "../../ui";
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
type InterestedProvider = {
  providerId: string;
  name: string;
  shopName: string | null;
  rating: number;
  state: string;
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
  const [applicantsFor, setApplicantsFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<MyRequest | null>(null);

  if (teamId) return <TeamDetail teamId={teamId} onBack={() => setTeamId(null)} />;
  if (applicantsFor)
    return <Applicants requestId={applicantsFor} onBack={() => setApplicantsFor(null)} />;
  if (editing) return <EditRequest request={editing} onBack={() => setEditing(null)} />;

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
            {r.mode} · {r.units} {t("units")} · {r.interestedCount} {t("interestedCount")} · {r.acceptedCount} {t("acceptedCount")}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {r.mode === "group" && !r.teamId && token && (
              <Button variant="gold" onClick={() => assemble.mutate(r._id)}>
                {t("assembleTeam")}
              </Button>
            )}
            {r.teamId && <Button onClick={() => setTeamId(r.teamId!)}>{t("teams")}</Button>}
            {/* Individual work is awarded by the customer, not claimed by whoever taps
                first — this is where they see who applied and pick one. */}
            {r.mode === "individual" && r.interestedCount > 0 && (
              <Button variant="gold" onClick={() => setApplicantsFor(r._id)}>
                {t("chooseProvider")} ({r.interestedCount})
              </Button>
            )}
            {r.status === "open" && (
              <Button variant="ghost" onClick={() => setEditing(r)}>
                {t("edit")}
              </Button>
            )}
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
              {team.complete ? t("coverageComplete") : t("coverageIncomplete")} · {team.status}
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
              {t("confirmTeam")}
            </Button>
          )}
        </>
      )}
    </Screen>
  );
}

// Providers who put their hand up for an individual job. Several may apply; the customer
// awards it to one, and choose-provider declines the rest so nobody is left waiting on work
// that has already gone elsewhere.
function Applicants({ requestId, onBack }: { requestId: string; onBack: () => void }) {
  const { token, t } = useAuth();
  const queryClient = useQueryClient();

  const { data: applicants } = useQuery({
    queryKey: ["requests/interested-providers", requestId, token],
    queryFn: () =>
      apiGet<InterestedProvider[]>("/api/requests/interested-providers", {
        token: token!,
        requestId,
      }),
    enabled: !!token,
  });

  const choose = useMutation({
    mutationFn: (providerId: string) =>
      apiPost("/api/requests/choose-provider", { token, requestId, providerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers/my-requests", token] });
      onBack();
    },
  });

  const waiting = (applicants ?? []).filter((a) => a.state === "interested");
  const awarded = (applicants ?? []).find((a) => a.state === "accepted");

  return (
    <Screen
      title={t("chooseProvider")}
      right={
        <button onClick={onBack} className="text-loom-indigo">
          ‹ {t("back")}
        </button>
      }
    >
      {applicants === undefined && <div className="text-loom-indigoSoft">…</div>}

      {awarded && (
        <Card className="mb-2">
          <div className="font-semibold text-loom-indigo">{awarded.shopName ?? awarded.name}</div>
          <div className="text-sm text-loom-leaf">{t("status_accepted")}</div>
        </Card>
      )}

      {!awarded && waiting.length === 0 && applicants !== undefined && (
        <div className="text-loom-indigoSoft">{t("noApplicantsYet")}</div>
      )}

      {!awarded &&
        waiting.map((a) => (
          <Card key={a.providerId} className="mb-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-loom-indigo">{a.shopName ?? a.name}</div>
                <Stars value={a.rating} />
              </div>
              <Button
                variant="gold"
                disabled={choose.isPending}
                onClick={() => choose.mutate(a.providerId)}
              >
                {t("choose")}
              </Button>
            </div>
          </Card>
        ))}

      {choose.isError && (
        <div className="text-loom-madder text-sm">{(choose.error as Error).message}</div>
      )}
    </Screen>
  );
}

// Editing is only offered while the work is still open — see api/_routes/requests/update.ts
// for why assigned work is fixed.
function EditRequest({ request, onBack }: { request: MyRequest; onBack: () => void }) {
  const { token, t } = useAuth();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(request.title);
  const [units, setUnits] = useState(String(request.units));

  const save = useMutation({
    mutationFn: () =>
      apiPost("/api/requests/update", {
        token,
        requestId: request._id,
        title: title.trim(),
        units: Number(units),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers/my-requests", token] });
      onBack();
    },
  });

  const unitsValid = Number.isFinite(Number(units)) && Number(units) > 0;

  return (
    <Screen
      title={t("editRequest")}
      right={
        <button onClick={onBack} className="text-loom-indigo">
          ‹ {t("back")}
        </button>
      }
    >
      <Card>
        <Field label={t("newRequest")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Field
          label={t("units")}
          value={units}
          inputMode="numeric"
          onChange={(e) => setUnits(e.target.value)}
        />
        <Button
          className="w-full"
          disabled={!title.trim() || !unitsValid || save.isPending}
          onClick={() => save.mutate()}
        >
          {t("save")}
        </Button>
        {save.isError && (
          <div className="mt-2 text-loom-madder text-sm">{(save.error as Error).message}</div>
        )}
      </Card>
    </Screen>
  );
}
