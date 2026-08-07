import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { RoleSwitch } from "../shared/RoleSwitch";
import { useAuth } from "../../auth";
import { Card, Field, Screen, Stars } from "../../ui";
import { SignOut } from "../provider/Current";

type HistoryRow = { _id: string; name: string; shopName: string | null; rating: number };

export function CustomerProfile() {
  const { token, t, me } = useAuth();
  const queryClient = useQueryClient();
  const customer = me && me.role === "customer" ? me.customer : null;

  const { data: history } = useQuery({
    queryKey: ["customers/history", token],
    queryFn: () => apiGet<HistoryRow[]>("/api/customers/history", { token: token! }),
    enabled: !!token,
  });
  const update = useMutation({
    mutationFn: (patch: { name?: string; company?: string }) => apiPost("/api/customers/update-profile", { token, ...patch }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me", token] }),
  });

  if (!customer || !token) return <Screen title={t("profile")} right={<SignOut />}><div /></Screen>;

  return (
    <Screen title={t("profile")} right={<SignOut />}>
      <Card>
        <Field label={t("name")} defaultValue={customer.name} onBlur={(e) => update.mutate({ name: e.target.value })} />
        <Field label={t("company")} defaultValue={customer.company ?? ""} onBlur={(e) => update.mutate({ company: e.target.value })} />
      </Card>
      <Card>
        <h2 className="font-semibold text-loom-indigo mb-2">{t("history")}</h2>
        {history === undefined && <div className="text-loom-indigoSoft">…</div>}
        {history && history.length === 0 && <div className="text-loom-indigoSoft">{t("noResults")}</div>}
        {history?.map((p) => (
          <div key={p._id} className="flex items-center justify-between py-1">
            <span className="text-loom-indigo">{p.shopName ?? p.name}</span>
            <Stars value={p.rating} />
          </div>
        ))}
      </Card>
      <RoleSwitch />
    </Screen>
  );
}
