import { useState } from "react";
import { apiPost, ApiError } from "../../lib/api";
import { useAuth } from "../../auth";
import { Button, Card, Field } from "../../ui";

// One phone number can hold both a provider and a customer account — someone who stitches for
// a living may also need to hire a caterer. This is where the second account gets created:
// sign-in alone can never do it, because once a number has any account verify-otp goes
// straight to a session for it.
//
// After the second account exists, signing in offers a "continue as" choice instead.
export function RoleSwitch() {
  const { token, me, setToken, t } = useAuth();
  const [name, setName] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!me || !token || me.role === "admin") return null;
  const target = me.role === "provider" ? "customer" : "provider";

  const go = async (withName?: string) => {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiPost<{ token: string }>("/api/auth/switch-role", {
        token,
        role: target,
        name: withName,
      });
      setToken(res.token);
    } catch (e) {
      // The account does not exist yet, so the server needs a name for it.
      if (e instanceof ApiError && e.message.toLowerCase().includes("name")) {
        setAsking(true);
      } else {
        setErr(e instanceof ApiError ? e.message : String(e));
      }
      setBusy(false);
    }
  };

  return (
    <Card className="mt-4">
      <div className="text-sm text-loom-indigoSoft mb-2">
        {target === "customer" ? t("alsoHireHint") : t("alsoWorkHint")}
      </div>

      {asking && (
        <Field
          label={t("name")}
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      )}

      <Button
        variant="ghost"
        className="w-full"
        disabled={busy || (asking && !name.trim())}
        onClick={() => go(asking ? name.trim() : undefined)}
      >
        {target === "customer" ? t("switchToCustomer") : t("switchToProvider")}
      </Button>

      {err && <div className="mt-2 text-loom-madder text-sm">{err}</div>}
    </Card>
  );
}
