import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../auth";
import { Button, Card, Screen } from "../../ui";
import { SignOut } from "./Current";

export function ProviderRequests() {
  const { token, t } = useAuth();
  const incoming = useQuery(api.requests.myIncoming, token ? { token } : "skip");
  const respond = useMutation(api.requests.respond);

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
              <Button variant="leaf" onClick={() => respond({ token, requestId: r._id, accept: true })}>
                ✓ {t("accept")}
              </Button>
              <Button variant="danger" onClick={() => respond({ token, requestId: r._id, accept: false })}>
                ✗ {t("decline")}
              </Button>
            </div>
          )}
        </Card>
      ))}
    </Screen>
  );
}
