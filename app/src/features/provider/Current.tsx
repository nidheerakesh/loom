import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth";
import { pickLang } from "../../i18n";
import { Button, Card, Screen, ListenButton, TextButton } from "../../ui";
import { apiGet, apiPost } from "../../lib/api";

type FeedCard = {
  requestId: string;
  title: string;
  mode: "individual" | "group";
  units: number;
  pay: number | null;
  distanceKm: number;
  matchedSkill: string;
  matchedSkillMl: string | null;
  total: number;
  headcount: number | null;
  interestDeadline: string | null;
};

export function ProviderCurrent() {
  const { token, t, lang } = useAuth();
  const queryClient = useQueryClient();
  const { data: feed } = useQuery({
    queryKey: ["matching/feed", token],
    queryFn: () => apiGet<FeedCard[]>("/api/matching/feed", { token: token! }),
    enabled: !!token,
  });
  const respond = useMutation({
    mutationFn: (body: { requestId: string; accept: boolean }) => apiPost("/api/requests/respond", { token, ...body }),
    onSuccess: () => {
      // Accepting moves the job out of this feed and into My work, so refresh both.
      void queryClient.invalidateQueries({ queryKey: ["matching/feed", token] });
      void queryClient.invalidateQueries({ queryKey: ["requests/my-accepted", token] });
    },
  });
  const getNarration = useMutation({
    mutationFn: (requestId: string) =>
      apiPost<{ text: string; path: string[][] }>("/api/narration/get", { token, requestId }),
  });

  const [open, setOpen] = useState<
    { requestId: string; title: string; mode: "individual" | "group"; text: string; path: string[][] } | null
  >(null);

  const openMatch = async (requestId: string, title: string, mode: "individual" | "group") => {
    if (!token) return;
    const res = await getNarration.mutateAsync(requestId);
    setOpen({ requestId, title, mode, text: res.text, path: res.path });
  };

  return (
    <Screen title={t("findWork")} right={<SignOut />}>
      {/* Teams and accepted work moved to the My work tab — this screen is only the feed of
          work still available to take. */}
      <h2 className="font-semibold text-loom-indigo mb-2">{t("findWork")}</h2>
      {feed === undefined && <div className="text-loom-indigoSoft">…</div>}
      {feed && feed.length === 0 && <div className="text-loom-indigoSoft">{t("noResults")}</div>}
      {feed?.map((m) => (
        <Card key={m.requestId} className="mb-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="font-semibold text-loom-indigo">{m.title}</div>
                {m.mode === "group" && (
                  <span className="text-xs bg-loom-cottonDeep rounded-full px-2 py-1 text-loom-indigoSoft">
                    {t("group")}
                  </span>
                )}
              </div>
              <div className="text-sm text-loom-indigoSoft">
                {pickLang(lang, m.matchedSkill, m.matchedSkillMl)} · {m.distanceKm} {t("km")}
                {m.pay ? ` · ₹${m.pay}` : ""}
                {m.mode === "group" && m.headcount !== null && ` · ${m.headcount} ${t("peopleWanted")}`}
              </div>
            </div>
            <Button variant="gold" onClick={() => void openMatch(m.requestId, m.title, m.mode)}>
              ▶
            </Button>
          </div>
        </Card>
      ))}

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-20" onClick={() => setOpen(null)}>
          {/* A long decision path or narration text had nowhere to go — the sheet sat fixed
              to the viewport with no scroll of its own, so anything past the fold was just
              unreachable, not merely off-screen. */}
          <div
            className="bg-loom-cotton max-w-[520px] w-full max-h-[85vh] overflow-y-auto rounded-t-[14px] p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
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
                onClick={() => {
                  void (async () => {
                    await respond.mutateAsync({ requestId: open.requestId, accept: true });
                    setOpen(null);
                  })();
                }}
              >
                {open.mode === "group" ? t("expressInterest") : t("accept")}
              </Button>
            )}
            {respond.isError && (
              <div className="text-loom-madder text-sm">{respond.error.message}</div>
            )}
          </div>
        </div>
      )}
    </Screen>
  );
}

export function SignOut() {
  const { token, setToken, lang, setLang, t } = useAuth();
  return (
    <div className="flex items-center gap-2">
      <TextButton onClick={() => setLang(lang === "ml" ? "en" : "ml")}>
        {lang === "ml" ? "EN" : "മ"}
      </TextButton>
      <TextButton
        className="text-loom-madder no-underline"
        onClick={() => {
          void (async () => {
            if (token) await apiPost("/api/auth/sign-out", { token });
            setToken(null);
          })();
        }}
      >
        {t("signOut")}
      </TextButton>
    </div>
  );
}
