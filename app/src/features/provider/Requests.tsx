import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../auth";
import { Button, Card, Screen } from "../../ui";
import { SignOut } from "./Current";

type IncomingRequest = { _id: string; title: string; units: number; pay: number | null; distanceKm: number };

export function ProviderRequests() {
  const { token, t } = useAuth();
  const queryClient = useQueryClient();
  const { data: incoming } = useQuery({
    queryKey: ["requests/my-incoming", token],
    queryFn: () => apiGet<IncomingRequest[]>("/api/requests/my-incoming", { token: token! }),
    enabled: !!token,
  });
  const respond = useMutation({
    mutationFn: (body: { requestId: string; accept: boolean }) => apiPost("/api/requests/respond", { token, ...body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["requests/my-incoming", token] }),
  });

  return (
    <Screen title={t("requests")} right={<SignOut />}>
      {incoming === undefined && <div className="text-loom-indigoSoft">…</div>}
      {incoming && incoming.length === 0 && <div className="text-loom-indigoSoft">{t("noResults")}</div>}
      {incoming?.map((r) => (
        <Card key={r._id} className="mb-2">
          <div className="font-semibold text-loom-indigo">{r.title}</div>
          <div className="text-sm text-loom-indigoSoft">
            {r.distanceKm} {t("km")}
            {r.pay ? ` · ₹${r.pay}` : ""} · {r.units} {t("units")}
          </div>
          {token && (
            <div className="flex gap-2 mt-2">
              <Button variant="leaf" onClick={() => respond.mutate({ requestId: r._id, accept: true })}>
                {t("accept")}
              </Button>
              <Button variant="danger" onClick={() => respond.mutate({ requestId: r._id, accept: false })}>
                {t("decline")}
              </Button>
            </div>
          )}
        </Card>
      ))}
    </Screen>
  );
}
