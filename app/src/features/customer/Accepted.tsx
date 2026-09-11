import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { pickLang } from "../../i18n";
import { useAuth } from "../../auth";
import { Button, Card, Field, Screen, StarPicker, Stars, TextButton } from "../../ui";
import { SignOut } from "../provider/Current";
import { RequestPattern } from "../shared/RequestPattern";
import { FinalizeGroup } from "../shared/FinalizeGroup";

type MyRequest = {
  _id: string;
  title: string;
  mode: "individual" | "group";
  units: number;
  status: string;
  headcount: number | null;
  interestDeadline: string | null;
  interestedCount: number;
  acceptedCount: number;
  teamId: string | null;
  coordinatorRole: "customer" | "provider";
  coordinatorProviderId: string | null;
  coordinatorName: string | null;
  agreedRate: number | null;
  agreedRateUnit: string | null;
  coordinatorSignedOffAt: string | null;
  coordinatorResponse: "pending" | "accepted" | "declined";
  coordinatorAppointedAt: string | null;
  coordinatorDeclinedIds: string[];
  coordinatorDecidedAt: string | null;
  // Individual jobs only — who actually got it, once status is 'assigned'/'completed'. Group
  // orders show this via coordinatorName/team members instead.
  assignedProviderName: string | null;
};
type InterestedProvider = {
  providerId: string;
  name: string;
  shopName: string | null;
  rating: number;
  rate: number | null;
  rateUnit: string | null;
  distanceKm: number | null;
  // The same weighted score (skillFit/proximity/pay) matching/feed.ts ranks the job feed by,
  // computed for THIS applicant against THIS request — null only if she has none of the
  // request's skills at all (shouldn't happen for a real applicant, but a request with no
  // skills recorded is possible on an old row).
  score: number | null;
  state: string;
};

type ApplicantSort = "default" | "distance" | "rating" | "score";

// Distance/score-missing applicants sort last, not first — a null shouldn't look like "best".
function sortApplicants(list: InterestedProvider[], sortBy: ApplicantSort): InterestedProvider[] {
  if (sortBy === "default") return list;
  const sorted = [...list];
  if (sortBy === "distance") {
    sorted.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  } else if (sortBy === "score") {
    sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  } else {
    sorted.sort((a, b) => b.rating - a.rating);
  }
  return sorted;
}

function ApplicantSortBar({ sortBy, onChange, t }: { sortBy: ApplicantSort; onChange: (s: ApplicantSort) => void; t: (k: string) => string }) {
  return (
    <div className="flex gap-2 mb-2 flex-wrap">
      <TextButton className={sortBy === "score" ? "font-bold text-loom-indigo" : ""} onClick={() => onChange(sortBy === "score" ? "default" : "score")}>
        {t("sortByScore")}
      </TextButton>
      <TextButton className={sortBy === "distance" ? "font-bold text-loom-indigo" : ""} onClick={() => onChange(sortBy === "distance" ? "default" : "distance")}>
        {t("sortByDistance")}
      </TextButton>
      <TextButton className={sortBy === "rating" ? "font-bold text-loom-indigo" : ""} onClick={() => onChange(sortBy === "rating" ? "default" : "rating")}>
        {t("sortByRating")}
      </TextButton>
    </div>
  );
}
type Candidate = {
  providerId: string;
  name: string;
  shopName: string | null;
  capacity: number;
  rating: number;
  rate: number | null;
  rateUnit: string | null;
  proficiency: number;
  distanceKm: number | null;
};
type TeamMember = {
  providerId: string;
  skillId: string;
  name: string;
  shopName: string | null;
  group: string | null;
  skill: string;
  skillMl: string | null;
  coveredUnits: number;
  state: string;
};
type TeamSkill = {
  skillId: string;
  skill: string;
  skillMl: string | null;
  quantity: number;
  covered: number;
  shortfall: number;
};
type TeamDetailData = {
  _id: string;
  status: string;
  rationale: string;
  complete: boolean;
  requestId: string;
  requestTitle: string;
  requestUnits: number;
  requestStatus: string | null;
  coordinatorRole: "customer" | "provider";
  coordinatorProviderId: string | null;
  coordinatorName: string | null;
  agreedRate: number | null;
  agreedRateUnit: string | null;
  coordinatorSignedOffAt: string | null;
  coordinatorDeclinedIds: string[];
  coordinatorDecidedAt: string | null;
  skills: TeamSkill[];
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
  const complete = useMutation({
    mutationFn: (requestId: string) => apiPost("/api/requests/complete", { token, requestId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customers/my-requests", token] }),
  });
  const [teamId, setTeamId] = useState<string | null>(null);
  const [applicantsFor, setApplicantsFor] = useState<MyRequest | null>(null);
  const [editing, setEditing] = useState<MyRequest | null>(null);

  // A declined coordinator is a one-time thing to tell her about, not something to re-alert
  // on every 15s poll while the request still sits in 'declined' — remembered per request id
  // for the life of this screen.
  const alertedDeclines = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const r of requests ?? []) {
      if (r.coordinatorResponse === "declined" && !alertedDeclines.current.has(r._id)) {
        alertedDeclines.current.add(r._id);
        window.alert(`${r.title}: ${t("coordinatorDeclinedAlert")}`);
      }
    }
  }, [requests, t]);

  if (teamId) return <TeamDetail teamId={teamId} onBack={() => setTeamId(null)} />;
  if (applicantsFor)
    return applicantsFor.mode === "group" ? (
      <GroupApplicants request={applicantsFor} onBack={() => setApplicantsFor(null)} />
    ) : (
      <Applicants request={applicantsFor} onBack={() => setApplicantsFor(null)} />
    );
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
            {r.mode === "group" && r.headcount !== null && ` · ${r.headcount} ${t("peopleWanted")}`}
            {r.mode === "group" && r.agreedRate !== null && ` · ₹${r.agreedRate}${r.agreedRateUnit ? "/" + r.agreedRateUnit : ""}`}
          </div>
          {/* An individual job's card said "assigned" with no way to tell who to — the only
              place that information existed was the applicants screen, already gone once she'd
              picked someone. */}
          {r.mode === "individual" && r.assignedProviderName && (
            <div className="text-sm text-loom-indigo">{t("assignedTo")}: {r.assignedProviderName}</div>
          )}
          {/* Every group order has someone accountable for it — herself by default, shown
              only when she appointed someone else, so the common case (coordinating her own
              order) doesn't clutter the card with a badge that just says what's already true. */}
          {r.mode === "group" && r.coordinatorRole === "provider" && (
            <div className="text-sm text-loom-indigo">
              {t("coordinator")}: {r.coordinatorName ?? "—"}
              {r.coordinatorResponse === "pending" && r.coordinatorAppointedAt && (
                <span className="text-loom-turmeric">
                  {" "}
                  ({t("coordinatorPending")} — {t("waitingSince")} {new Date(r.coordinatorAppointedAt).toLocaleString()})
                </span>
              )}
            </div>
          )}
          {/* She declined — the request card carries the same message as the one-time popup,
              since the popup is easy to miss and this stays visible until she acts on it. */}
          {r.mode === "group" && r.coordinatorResponse === "declined" && (
            <div className="text-sm text-loom-madder">{t("coordinatorDeclinedBanner")}</div>
          )}
          {/* A team exists but nobody has gone through naming who's accountable for it yet —
              "start work" stays hidden until she has, even though the default (herself) needs
              no real decision from anyone else. */}
          {r.mode === "group" && r.teamId && !r.coordinatorDecidedAt && r.coordinatorResponse !== "declined" && (
            <div className="text-sm text-loom-turmeric">{t("waitingForCoordinatorSelection")}</div>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {r.teamId && <Button onClick={() => setTeamId(r.teamId)}>{t("teams")}</Button>}
            {/* Both individual and group work are awarded by the customer, not claimed by
                whoever taps first — this is where she sees who applied and picks. Group stays
                reachable even at zero applicants, so the headcount/deadline she set is visible
                without anyone having applied yet. */}
            {r.mode === "individual" && r.interestedCount > 0 && (
              <Button variant="gold" onClick={() => setApplicantsFor(r)}>
                {t("chooseProvider")} ({r.interestedCount})
              </Button>
            )}
            {r.mode === "group" && !r.teamId && r.status === "open" && (
              <Button variant="gold" onClick={() => setApplicantsFor(r)}>
                {t("viewApplicants")} ({r.interestedCount})
              </Button>
            )}
            {r.status === "open" && (
              <Button variant="ghost" onClick={() => setEditing(r)}>
                {t("edit")}
              </Button>
            )}
            {/* A group order with an appointed provider coordinator needs her sign-off first
                — requests/complete.ts refuses it server-side, so this mirrors that rather than
                offering a button that would just come back as an error. */}
            {r.status === "assigned" &&
              (r.mode !== "group" || !r.teamId || r.coordinatorDecidedAt) &&
              (r.mode !== "group" || r.coordinatorRole !== "provider" || r.coordinatorSignedOffAt) && (
                <Button variant="leaf" onClick={() => complete.mutate(r._id)}>
                  {t("markFinished")}
                </Button>
              )}
            {r.status === "assigned" &&
              r.mode === "group" &&
              r.coordinatorRole === "provider" &&
              !r.coordinatorSignedOffAt && (
                <span className="text-sm text-loom-turmeric self-center">
                  {r.coordinatorResponse === "pending" ? t("coordinatorPending") : t("awaitingSignoff")}
                </span>
              )}
          </div>
        </Card>
      ))}
    </Screen>
  );
}

function TeamDetail({ teamId, onBack }: { teamId: string; onBack: () => void }) {
  const { token, t, lang } = useAuth();
  const queryClient = useQueryClient();
  const { data: team } = useQuery({
    queryKey: ["team-assembly/get", teamId],
    queryFn: () => apiGet<TeamDetailData>("/api/team-assembly/get", { teamId }),
  });
  const confirm = useMutation({
    mutationFn: () => apiPost("/api/team-assembly/confirm", { token, teamId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-assembly/get", teamId] }),
  });
  // The candidate list answers one question — "who else can do this skill" — and two different
  // actions need it: replacing a woman already on the team, and adding one to a team that has
  // nobody spare. Sharing the state keeps a single picker on screen at a time, which is also
  // what stops "replace" and "add" both being half-open at once.
  type Picking = { kind: "swap"; member: TeamMember } | { kind: "add"; skill: TeamSkill };
  const [picking, setPicking] = useState<Picking | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pickingSkillId = picking?.kind === "swap" ? picking.member.skillId : picking?.skill.skillId;

  const { data: candidates } = useQuery({
    queryKey: ["team-assembly/candidates", teamId, pickingSkillId],
    queryFn: () =>
      apiGet<Candidate[]>("/api/team-assembly/candidates", {
        token: token!,
        teamId,
        skillId: pickingSkillId!,
      }),
    enabled: !!token && !!pickingSkillId,
  });
  const swap = useMutation({
    mutationFn: (replacementId: string) => {
      // Only reachable from the swap branch of the picker; asserting that here keeps the
      // outgoing body from ever carrying an empty providerId.
      if (picking?.kind !== "swap") throw new Error("No member selected to replace");
      return apiPost("/api/team-assembly/swap-member", {
        token,
        teamId,
        providerId: picking.member.providerId,
        replacementId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["team-assembly/get", teamId] });
      setPicking(null);
    },
  });
  const addMember = useMutation({
    mutationFn: (providerId: string) =>
      apiPost<{ assignedUnits: number; overAssigned: boolean }>("/api/team-assembly/add-member", {
        token,
        teamId,
        providerId,
        skillId: pickingSkillId,
      }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ["team-assembly/get", teamId] });
      // Adding past what the order needs is allowed, and worth saying out loud once.
      setNotice(r.overAssigned ? t("addedBeyondNeed") : null);
      setPicking(null);
    },
  });
  const removeMember = useMutation({
    mutationFn: (providerId: string) =>
      apiPost("/api/team-assembly/remove-member", { token, teamId, providerId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["team-assembly/get", teamId] });
    },
  });
  const rate = useMutation({
    mutationFn: (body: { providerId: string; stars: number; comment: string }) =>
      apiPost("/api/ratings/rate", { token, ...body }),
    onSuccess: () => setRating(null),
  });
  // Which member is being rated, and the draft rating for them.
  const [rating, setRating] = useState<{ providerId: string; stars: number; comment: string } | null>(null);
  // Finalize (coordinator + real price) is offered once the team is confirmed, and dismissible
  // — "skip for now" leaves the customer-default coordinator and whatever price was posted, so
  // nothing is blocked on it.
  const [dismissedFinalize, setDismissedFinalize] = useState(false);

  return (
    <Screen title={t("teams")} right={<TextButton onClick={onBack}>‹ {t("back")}</TextButton>}>
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
            {team.agreedRate !== null && (
              <div className="text-sm text-loom-indigo mt-1">
                {t("agreedRate")}: ₹{team.agreedRate}
                {team.agreedRateUnit ? `/${team.agreedRateUnit}` : ""}
              </div>
            )}
            {team.coordinatorRole === "provider" && (
              <div className="text-sm text-loom-indigo">
                {t("coordinator")}: {team.coordinatorName ?? "—"}
              </div>
            )}
          </Card>
          {notice && <Card className="mb-2"><div className="text-sm text-loom-indigo">{notice}</div></Card>}
          {team.status === "confirmed" && !dismissedFinalize && (
            <FinalizeGroup
              requestId={team.requestId}
              candidates={team.members
                .filter((m) => m.state !== "declined")
                .map((m) => ({ id: m.providerId, name: m.shopName ?? m.name }))}
              declinedIds={team.coordinatorDeclinedIds}
              initialRate={team.agreedRate}
              initialRateUnit={team.agreedRateUnit}
              onDone={() => {
                setDismissedFinalize(true);
                void queryClient.invalidateQueries({ queryKey: ["team-assembly/get", teamId] });
              }}
            />
          )}
          <RequestPattern requestId={team.requestId} canManage={team.coordinatorRole === "customer"} />

          {/* What the order asks for against what the team currently covers, and the way in to
              adding somebody. Shown whenever the team can still be edited — including when
              coverage is complete, because "complete" is the engine's minimum and not a cap on
              who the customer may bring in. */}
          {token && team.status === "proposed" && team.skills?.length > 0 && (
            <Card className="mb-2">
              <div className="font-semibold text-loom-indigo mb-1">{t("whatThisNeeds")}</div>
              {team.skills.map((sk) => (
                <div key={sk.skillId} className="flex items-center justify-between py-1">
                  <div className="text-sm">
                    <span className="text-loom-indigo">{pickLang(lang, sk.skill, sk.skillMl)}</span>
                    <span className={sk.shortfall > 0 ? "text-loom-madder" : "text-loom-indigoSoft"}>
                      {" "}
                      {sk.covered}/{sk.quantity} {t("units")}
                    </span>
                  </div>
                  <Button
                    variant={sk.shortfall > 0 ? "gold" : "ghost"}
                    onClick={() => setPicking({ kind: "add", skill: sk })}
                  >
                    {t("addMember")}
                  </Button>
                </div>
              ))}
            </Card>
          )}

          {/* Choosing somebody for a slot — a replacement, or an extra pair of hands. Ranked the
              way assembly ranks, so the list reads as "who it would have picked next". */}
          {picking && (
            <Card className="mb-2">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-loom-indigo">
                  {picking.kind === "swap"
                    ? `${t("swapMember")}: ${picking.member.shopName ?? picking.member.name}`
                    : `${t("addMember")}: ${pickLang(lang, picking.skill.skill, picking.skill.skillMl)}`}
                </div>
                <TextButton onClick={() => setPicking(null)}>{t("cancel")}</TextButton>
              </div>
              {/* Said before she picks, not after: adding here is deliberate, not a mistake. */}
              {picking.kind === "add" && picking.skill.shortfall === 0 && (
                <div className="mb-2 text-sm text-loom-indigoSoft">{t("alreadyCoveredHint")}</div>
              )}
              {candidates === undefined && <div className="text-loom-indigoSoft">…</div>}
              {candidates?.length === 0 && (
                <div className="text-loom-indigoSoft text-sm">{t("noAlternatives")}</div>
              )}
              {candidates?.map((c) => (
                <div key={c.providerId} className="flex items-center justify-between py-1">
                  <div>
                    <div className="text-loom-indigo">{c.shopName ?? c.name}</div>
                    <div className="text-xs text-loom-indigoSoft">
                      {c.distanceKm !== null && `${c.distanceKm} ${t("km")} · `}
                      {c.capacity} {t("people")}
                      {c.rate !== null && ` · ₹${c.rate}${c.rateUnit ? "/" + c.rateUnit : ""}`}
                    </div>
                  </div>
                  <Button
                    variant="gold"
                    disabled={swap.isPending || addMember.isPending}
                    onClick={() =>
                      picking.kind === "swap"
                        ? swap.mutate(c.providerId)
                        : addMember.mutate(c.providerId)
                    }
                  >
                    {t("choose")}
                  </Button>
                </div>
              ))}
              {swap.isError && (
                <div className="mt-2 text-loom-madder text-sm">{(swap.error).message}</div>
              )}
              {addMember.isError && (
                <div className="mt-2 text-loom-madder text-sm">{(addMember.error).message}</div>
              )}
            </Card>
          )}

          {team.members.map((m, i) => (
            <Card key={`${m.providerId}-${m.skill}-${i}`} className="mb-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-loom-indigo">{m.shopName ?? m.name}</div>
                  <div className="text-sm text-loom-indigoSoft">
                    {m.group ?? "—"} · {pickLang(lang, m.skill, m.skillMl)} · {m.coveredUnits}{" "}
                    {t("units")}
                  </div>
                  <div
                    className={`text-sm font-medium ${
                      m.state === "declined"
                        ? "text-loom-madder"
                        : m.state === "accepted"
                          ? "text-loom-leaf"
                          : "text-loom-indigoSoft"
                    }`}
                  >
                    {/* A member of a draft team carries state "invited" in the database from the
                        moment the team is assembled, but nothing has been sent to her yet — the
                        provider sees nothing until the customer confirms. Saying "Invited" here
                        contradicts that on the customer's own screen. */}
                    {team.status === "proposed" && m.state === "invited"
                      ? t("status_notyet")
                      : t(`status_${m.state}`)}
                    {m.state === "declined" && ` — ${t("slotNeedsFilling")}`}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {/* Replaceable while the team is a draft, and afterwards only if this
                      person declined — their slot is vacant, so filling it revokes nothing. */}
                  {token && (team.status === "proposed" || m.state === "declined") && (
                    <Button
                      variant={m.state === "declined" ? "gold" : "ghost"}
                      onClick={() => setPicking({ kind: "swap", member: m })}
                    >
                      {t("swapMember")}
                    </Button>
                  )}
                  {/* Replace insists on a replacement. A customer who wants a smaller team, or
                      can see no suitable alternative, needs to be able to simply remove — the
                      engine recomputes coverage and the team stops claiming to cover her
                      units. Same permission rule as Replace. */}
                  {token && (team.status === "proposed" || m.state === "declined") && (
                    <Button
                      variant="ghost"
                      disabled={removeMember.isPending}
                      onClick={() => removeMember.mutate(m.providerId)}
                    >
                      {t("removeMember")}
                    </Button>
                  )}
                  {token && team.status === "confirmed" && rating?.providerId !== m.providerId && (
                    <Button
                      variant="ghost"
                      onClick={() => setRating({ providerId: m.providerId, stars: 5, comment: "" })}
                    >
                      {t("rateProvider")}
                    </Button>
                  )}
                </div>
              </div>

              {/* Star and comment, rather than a button that silently posted five stars. */}
              {rating?.providerId === m.providerId && (
                <div className="mt-3">
                  <StarPicker
                    value={rating.stars}
                    onChange={(stars) => setRating({ ...rating, stars })}
                  />
                  <Field
                    className="mt-2"
                    value={rating.comment}
                    placeholder={t("ratingCommentPlaceholder")}
                    onChange={(e) => setRating({ ...rating, comment: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="gold"
                      disabled={rate.isPending}
                      onClick={() => rate.mutate(rating)}
                    >
                      {t("submit")}
                    </Button>
                    <Button variant="ghost" onClick={() => setRating(null)}>
                      {t("cancel")}
                    </Button>
                  </div>
                </div>
              )}
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
function Applicants({ request, onBack }: { request: MyRequest; onBack: () => void }) {
  const { token, t } = useAuth();
  const queryClient = useQueryClient();
  const requestId = request._id;

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
      void queryClient.invalidateQueries({ queryKey: ["customers/my-requests", token] });
      onBack();
    },
  });

  // Same choice a group order already had (auto-assembly vs. open call), now here too: ask
  // the same scoring formula the job feed ranks by who it would pick. Read-only — this only
  // previews a name and a score. Finalizing is a second, explicit tap that goes through
  // choose-provider.ts, same as picking someone herself, so she always sees who before it's
  // real and can still change her mind.
  type AutoPick = { providerId: string; name: string; shopName: string | null; score: number };
  const [autoPick, setAutoPick] = useState<AutoPick | null>(null);
  const autoChoose = useMutation({
    mutationFn: () => apiPost<AutoPick>("/api/requests/auto-choose", { token, requestId }),
    onSuccess: (pick) => setAutoPick(pick),
  });

  const [sortBy, setSortBy] = useState<ApplicantSort>("default");
  const waiting = sortApplicants((applicants ?? []).filter((a) => a.state === "interested"), sortBy);
  const awarded = (applicants ?? []).find((a) => a.state === "accepted");
  const deadlinePassed =
    !!request.interestDeadline && new Date(request.interestDeadline).getTime() < Date.now();

  return (
    <Screen
      title={t("chooseProvider")}
      right={
        <TextButton onClick={onBack}>‹ {t("back")}</TextButton>
      }
    >
      {request.interestDeadline && (
        <Card className="mb-2">
          <div className="text-sm text-loom-indigoSoft">
            {t("applyBy")} {new Date(request.interestDeadline).toLocaleString()}
          </div>
          {deadlinePassed && <div className="text-sm text-loom-madder mt-1">{t("interestDeadlinePassed")}</div>}
        </Card>
      )}

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

      {!awarded && autoPick && (
        <Card className="mb-2">
          <div className="text-sm text-loom-indigoSoft mb-1">{t("algorithmSuggests")}</div>
          <div className="font-semibold text-loom-indigo">{autoPick.shopName ?? autoPick.name}</div>
          <div className="text-xs text-loom-indigoSoft mb-2">{t("matchScore")}: {(autoPick.score * 100).toFixed(0)}%</div>
          <div className="flex gap-2">
            <Button
              variant="gold"
              className="flex-1"
              disabled={choose.isPending}
              onClick={() => choose.mutate(autoPick.providerId)}
            >
              {t("finalize")}
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setAutoPick(null)}>
              {t("cancel")}
            </Button>
          </div>
        </Card>
      )}

      {!awarded && !autoPick && waiting.length > 0 && (
        <>
          <ApplicantSortBar sortBy={sortBy} onChange={setSortBy} t={t} />
          <Button
            variant="ghost"
            className="w-full mb-2"
            disabled={autoChoose.isPending}
            onClick={() => void autoChoose.mutate()}
          >
            {t("autoSelect")}
          </Button>
        </>
      )}

      {!awarded && !autoPick &&
        waiting.map((a) => (
          <Card key={a.providerId} className="mb-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-loom-indigo">{a.shopName ?? a.name}</div>
                <Stars value={a.rating} />
                {a.distanceKm !== null && (
                  <div className="text-xs text-loom-indigoSoft">{a.distanceKm} {t("km")}</div>
                )}
                {a.score !== null && (
                  <div className="text-xs text-loom-indigoSoft">{t("matchScore")}: {(a.score * 100).toFixed(0)}%</div>
                )}
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
        <div className="text-loom-madder text-sm">{(choose.error).message}</div>
      )}
      {autoChoose.isError && (
        <div className="text-loom-madder text-sm">{(autoChoose.error).message}</div>
      )}
    </Screen>
  );
}

// The open call for a group order: everyone who applied, in one list, with a checkbox each.
// Individual work has exactly one winner (Applicants above); a group order has none until the
// customer says how many of the applicants she wants — so this is that screen's plural cousin,
// not a copy of it with a bigger button.
//
// Once the request leaves 'open' (select-team.ts has run), this renders read-only: who was
// picked, and who was not.
function GroupApplicants({ request, onBack }: { request: MyRequest; onBack: () => void }) {
  const { token, t } = useAuth();
  const queryClient = useQueryClient();
  const requestId = request._id;

  const { data: applicants } = useQuery({
    queryKey: ["requests/interested-providers", requestId, token],
    queryFn: () =>
      apiGet<InterestedProvider[]>("/api/requests/interested-providers", { token: token!, requestId }),
    enabled: !!token,
  });

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    const next = new Set(picked);
    next.has(id) ? next.delete(id) : next.add(id);
    setPicked(next);
  };
  // Set once selection succeeds, with the names of who was actually picked — the finalize
  // step (coordinator + real price) replaces the rest of this screen rather than sending her
  // back to the list, since there's nothing left on it worth returning to.
  const [finalizing, setFinalizing] = useState<{ id: string; name: string }[] | null>(null);
  const [sortBy, setSortBy] = useState<ApplicantSort>("default");

  const selectTeam = useMutation({
    mutationFn: () =>
      apiPost<{ selected: number }>("/api/requests/select-team", { token, requestId, providerIds: [...picked] }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers/my-requests", token] });
      const byId = new Map((applicants ?? []).map((a) => [a.providerId, a.shopName ?? a.name] as const));
      setFinalizing([...picked].map((id) => ({ id, name: byId.get(id) ?? id })));
    },
  });

  if (finalizing) {
    return (
      <Screen title={t("viewApplicants")} right={<TextButton onClick={onBack}>‹ {t("back")}</TextButton>}>
        <FinalizeGroup
          requestId={requestId}
          candidates={finalizing}
          declinedIds={request.coordinatorDeclinedIds}
          initialRate={request.agreedRate}
          initialRateUnit={request.agreedRateUnit}
          onDone={onBack}
        />
      </Screen>
    );
  }

  const decided = request.status !== "open";
  const waiting = sortApplicants((applicants ?? []).filter((a) => a.state === "interested"), sortBy);
  const chosen = (applicants ?? []).filter((a) => a.state === "accepted");
  const deadlinePassed =
    !!request.interestDeadline && new Date(request.interestDeadline).getTime() < Date.now();
  const overHeadcount = !!request.headcount && picked.size > request.headcount;

  return (
    <Screen title={t("viewApplicants")} right={<TextButton onClick={onBack}>‹ {t("back")}</TextButton>}>
      <Card className="mb-2">
        <div className="text-sm text-loom-indigoSoft">
          {request.headcount !== null && `${request.headcount} ${t("peopleWanted")}`}
          {request.headcount !== null && request.interestDeadline && " · "}
          {request.interestDeadline &&
            `${t("applyBy")} ${new Date(request.interestDeadline).toLocaleString()}`}
        </div>
        {request.agreedRate !== null && (
          <div className="text-sm text-loom-indigo mt-1">
            {t("agreedRate")}: ₹{request.agreedRate}
            {request.agreedRateUnit ? `/${request.agreedRateUnit}` : ""}
          </div>
        )}
        {request.coordinatorRole === "provider" && (
          <div className="text-sm text-loom-indigo">
            {t("coordinator")}: {request.coordinatorName ?? "—"}
          </div>
        )}
        {!decided && deadlinePassed && (
          <div className="text-sm text-loom-madder mt-1">{t("interestDeadlinePassed")}</div>
        )}
      </Card>
      <RequestPattern requestId={requestId} canManage={request.coordinatorRole === "customer"} />

      {applicants === undefined && <div className="text-loom-indigoSoft">…</div>}

      {decided ? (
        <>
          {chosen.map((a) => (
            <Card key={a.providerId} className="mb-2">
              <div className="font-semibold text-loom-indigo">{a.shopName ?? a.name}</div>
              <div className="text-sm text-loom-leaf">{t("status_accepted")}</div>
            </Card>
          ))}
          {(applicants ?? [])
            .filter((a) => a.state === "declined")
            .map((a) => (
              <Card key={a.providerId} className="mb-2">
                <div className="font-semibold text-loom-indigo">{a.shopName ?? a.name}</div>
                <div className="text-sm text-loom-indigoSoft">{t("status_declined")}</div>
              </Card>
            ))}
        </>
      ) : (
        <>
          {waiting.length === 0 && applicants !== undefined && (
            <div className="text-loom-indigoSoft">{t("noApplicantsYet")}</div>
          )}
          {waiting.length > 0 && <ApplicantSortBar sortBy={sortBy} onChange={setSortBy} t={t} />}
          {waiting.map((a) => (
            <Card key={a.providerId} className="mb-2">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-semibold text-loom-indigo">{a.shopName ?? a.name}</div>
                  <Stars value={a.rating} />
                  {/* Her own asking rate — not what the job will finally pay, but what she'd
                      compare candidates by before deciding. */}
                  {a.rate !== null && (
                    <div className="text-xs text-loom-indigoSoft">
                      {t("providerOwnRate")}: ₹{a.rate}
                      {a.rateUnit ? `/${a.rateUnit}` : ""}
                    </div>
                  )}
                  {a.distanceKm !== null && (
                    <div className="text-xs text-loom-indigoSoft">{a.distanceKm} {t("km")}</div>
                  )}
                  {a.score !== null && (
                    <div className="text-xs text-loom-indigoSoft">{t("matchScore")}: {(a.score * 100).toFixed(0)}%</div>
                  )}
                </div>
                <input
                  type="checkbox"
                  className="w-6 h-6"
                  checked={picked.has(a.providerId)}
                  onChange={() => toggle(a.providerId)}
                />
              </label>
            </Card>
          ))}
          {waiting.length > 0 && (
            <>
              <div className="text-sm text-loom-indigoSoft mb-2">
                {picked.size} {request.headcount !== null && `${t("selectedOfHeadcount")} ${request.headcount}`}
              </div>
              {overHeadcount && <div className="text-sm text-loom-madder mb-2">{t("overHeadcount")}</div>}
              <Button
                variant="gold"
                className="w-full"
                disabled={picked.size === 0 || overHeadcount || selectTeam.isPending}
                onClick={() => selectTeam.mutate()}
              >
                {t("selectTeam")} ({picked.size})
              </Button>
            </>
          )}
          {selectTeam.isError && (
            <div className="text-loom-madder text-sm mt-2">{selectTeam.error.message}</div>
          )}
        </>
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
      void queryClient.invalidateQueries({ queryKey: ["customers/my-requests", token] });
      onBack();
    },
  });

  const unitsValid = Number.isFinite(Number(units)) && Number(units) > 0;

  return (
    <Screen
      title={t("editRequest")}
      right={
        <TextButton onClick={onBack}>‹ {t("back")}</TextButton>
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
          <div className="mt-2 text-loom-madder text-sm">{(save.error).message}</div>
        )}
      </Card>
    </Screen>
  );
}
