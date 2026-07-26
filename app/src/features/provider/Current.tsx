import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "../../auth";
import { Button, Card, Screen, ListenButton } from "../../ui";

export function ProviderCurrent() {
  const { token, t } = useAuth();
  const feed = useQuery(api.matching.individualFeed, token ? { token } : "skip");
  const teams = useQuery(api.teamAssembly.myTeams, token ? { token } : "skip");
  const getNarration = useMutation(api.narration.getForMatch);
  const respond = useMutation(api.requests.respond);
  const respondInvite = useMutation(api.teamAssembly.respondInvite);

  const [open, setOpen] = useState<{ requestId: Id<"requests">; title: string; text: string; path: string[][] } | null>(null);

  const openMatch = async (requestId: Id<"requests">, title: string) => {
    if (!token) return;
    const res = await getNarration({ token, requestId });
    setOpen({ requestId, title, text: res.text, path: res.path });
  };

  return (
    <Screen title={t("findWork")} right={<SignOut />}>
      {teams && teams.length > 0 && (
        <section>
          <h2 className="font-semibold text-loom-indigo mb-2">{t("teams")}</h2>
          {teams.map((tm) => (
            <Card key={tm.teamId} className="mb-2">
              <div className="font-semibold text-loom-indigo">{tm.requestTitle}</div>
              <div className="text-sm text-loom-indigoSoft">
                {tm.skillMl ?? tm.skill} · {tm.coveredUnits} {t("units")} · {tm.state}
              </div>
              {tm.state === "invited" && token && (
                <div className="flex gap-2 mt-2">
                  <Button variant="leaf" onClick={() => respondInvite({ token, teamId: tm.teamId, accept: true })}>
                    ✓ {t("accept")}
                  </Button>
                  <Button variant="danger" onClick={() => respondInvite({ token, teamId: tm.teamId, accept: false })}>
                    ✗ {t("decline")}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </section>
      )}

      <h2 className="font-semibold text-loom-indigo mb-2">{t("findWork")}</h2>
      {feed === undefined && <div className="text-loom-indigoSoft">…</div>}
      {feed && feed.length === 0 && <div className="text-loom-indigoSoft">{t("noResults")}</div>}
      {feed?.map((m) => (
        <Card key={m.requestId} className="mb-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-loom-indigo">{m.title}</div>
              <div className="text-sm text-loom-indigoSoft">
                {m.matchedSkillMl ?? m.matchedSkill} · {m.distanceKm} {t("km")}
                {m.pay ? ` · ₹${m.pay}` : ""}
              </div>
            </div>
            <Button variant="gold" onClick={() => openMatch(m.requestId, m.title)}>
              ▶
            </Button>
          </div>
        </Card>
      ))}

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-20" onClick={() => setOpen(null)}>
          <div className="bg-loom-cotton max-w-[520px] w-full rounded-t-[14px] p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-loom-indigo">{open.title}</h3>
              <ListenButton text={open.text} />
            </div>
            <p className="text-loom-ink">{open.text}</p>
            <div className="text-xs text-loom-indigoSoft">
              {open.path.map((seg, i) => (
                <div key={i}>{seg.join(" → ")}</div>
              ))}
            </div>
            {token && (
              <Button
                variant="gold"
                className="w-full"
                onClick={async () => {
                  await respond({ token, requestId: open.requestId, accept: true });
                  setOpen(null);
                }}
              >
                ✋ {t("interested")}
              </Button>
            )}
          </div>
        </div>
      )}
    </Screen>
  );
}

export function SignOut() {
  const { token, setToken, lang, setLang, t } = useAuth();
  const signOut = useMutation(api.auth.signOut);
  return (
    <div className="flex items-center gap-2">
      <button className="text-sm underline text-loom-indigoSoft" onClick={() => setLang(lang === "ml" ? "en" : "ml")}>
        {lang === "ml" ? "EN" : " മ"}
      </button>
      <button
        className="text-sm text-loom-madder"
        onClick={async () => {
          if (token) await signOut({ token });
          setToken(null);
        }}
      >
        {t("signOut")}
      </button>
    </div>
  );
}
