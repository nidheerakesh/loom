import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, POLL_MS } from "../../lib/api";
import { useAuth } from "../../auth";
import { Button, Card, Screen } from "../../ui";
import { SignOut } from "../provider/Current";

type Grievance = {
  _id: string;
  subject: string;
  body: string;
  status: "open" | "reviewing" | "resolved";
  reporterRole: "provider" | "customer";
  reporterName: string;
  createdAt: string;
};

const FILTERS = ["open", "reviewing", "resolved"] as const;

// The moderation surface. Grievances were collected from the first week and read by nobody —
// `grievances/mine` shows you only your own — so every complaint ever filed went into the
// database and stopped there. This is the other end of that.
//
// English only, deliberately. A provider's screens are Malayalam-first because that is who they
// are for; this one is for whoever is running the deployment, and inventing Malayalam
// moderation vocabulary nobody has asked for would be worse than not translating it.
export function AdminApp() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number] | "all">("open");

  const { data: grievances } = useQuery({
    queryKey: ["grievances/list", token, filter],
    queryFn: () =>
      apiGet<Grievance[]>("/api/grievances/list", {
        token: token!,
        ...(filter === "all" ? {} : { status: filter }),
      }),
    enabled: !!token,
    refetchInterval: POLL_MS,
  });

  const setStatus = useMutation({
    mutationFn: (body: { grievanceId: string; status: string }) =>
      apiPost("/api/grievances/set-status", { token, ...body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["grievances/list"] });
    },
  });

  const counts = (grievances ?? []).length;

  return (
    <Screen title="Grievances" right={<SignOut />}>
      <div className="flex flex-wrap gap-2 mb-3">
        {(["open", "reviewing", "resolved", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`min-h-[56px] px-4 rounded-[14px] border text-sm ${
              filter === f
                ? "bg-loom-indigo text-loom-cotton border-loom-indigo"
                : "bg-loom-cotton text-loom-indigo border-loom-cottonDeep"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {grievances === undefined && <div className="text-loom-indigoSoft">…</div>}
      {grievances && counts === 0 && (
        <div className="text-loom-indigoSoft">Nothing {filter === "all" ? "filed" : filter}.</div>
      )}

      {(grievances ?? []).map((g) => (
        <Card key={g._id} className="mb-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-loom-indigo">{g.subject}</div>
              <div className="text-sm text-loom-indigoSoft mt-1">{g.body}</div>
              <div className="text-xs text-loom-indigoSoft mt-2">
                {g.reporterName} · {g.reporterRole} · {new Date(g.createdAt).toLocaleDateString()}
              </div>
            </div>
            <span
              className={`text-xs font-medium whitespace-nowrap ${
                g.status === "resolved"
                  ? "text-loom-leaf"
                  : g.status === "reviewing"
                    ? "text-loom-kasavu"
                    : "text-loom-madder"
              }`}
            >
              {g.status}
            </span>
          </div>

          <div className="flex gap-2 mt-3">
            {FILTERS.filter((s) => s !== g.status).map((s) => (
              <Button
                key={s}
                variant="ghost"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ grievanceId: g._id, status: s })}
              >
                {s === "reviewing" ? "Start review" : s === "resolved" ? "Resolve" : "Reopen"}
              </Button>
            ))}
          </div>
        </Card>
      ))}
    </Screen>
  );
}
