import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "../../auth";
import { Card, Field, Screen, Stars } from "../../ui";
import { SignOut } from "../provider/Current";

export function CustomerProfile() {
  const { token, t, me } = useAuth();
  const customer = me && me.role === "customer" ? me.customer : null;
  const history = useQuery(api.customers.history, token ? { token } : "skip");
  const update = useMutation(api.customers.updateProfile);

  if (!customer || !token) return <Screen title={t("profile")} right={<SignOut />}><div /></Screen>;

  return (
    <Screen title={t("profile")} right={<SignOut />}>
      <Card>
        <Field label={t("name")} defaultValue={customer.name} onBlur={(e) => update({ token, name: e.target.value })} />
        <Field label="Company" defaultValue={customer.company ?? ""} onBlur={(e) => update({ token, company: e.target.value })} />
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
    </Screen>
  );
}
