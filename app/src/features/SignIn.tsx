import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../auth";
import { Button, Card, Field } from "../ui";

type Role = "provider" | "customer";

export function SignIn() {
  const { setToken, t, lang, setLang } = useAuth();
  const requestOtp = useMutation(api.auth.requestOtp);
  const verifyOtp = useMutation(api.auth.verifyOtp);

  const [role, setRole] = useState<Role>("provider");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    setErr(null);
    try {
      const res = await requestOtp({ phone, role });
      setSent(true);
      setDevCode(res.devCode);
    } catch (e) {
      setErr(String(e));
    }
  };

  const verify = async () => {
    setErr(null);
    try {
      const res = await verifyOtp({ phone, code, role, name: name || undefined });
      setToken(res.token);
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div className="max-w-[520px] mx-auto min-h-screen bg-loom-cotton p-6 flex flex-col justify-center">
      <div className="text-center mb-6">
        <div className="text-4xl font-bold text-loom-indigo">{t("appName")}</div>
        <div className="text-loom-indigoSoft">Weaving skills into income</div>
        <button
          className="mt-2 text-sm underline text-loom-indigoSoft"
          onClick={() => setLang(lang === "ml" ? "en" : "ml")}
        >
          {lang === "ml" ? "English" : "മലയാളം"}
        </button>
      </div>

      <Card>
        <div className="flex gap-2 mb-4">
          <Button
            variant={role === "provider" ? "primary" : "ghost"}
            className="flex-1"
            onClick={() => setRole("provider")}
          >
            🧵 {t("provider")}
          </Button>
          <Button
            variant={role === "customer" ? "primary" : "ghost"}
            className="flex-1"
            onClick={() => setRole("customer")}
          >
            🛍️ {t("customer")}
          </Button>
        </div>

        {!sent ? (
          <>
            <Field
              label={t("phone")}
              value={phone}
              inputMode="tel"
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9876500000"
            />
            <Field label={t("name")} value={name} onChange={(e) => setName(e.target.value)} />
            <Button className="w-full" onClick={send} disabled={!phone}>
              {t("sendCode")}
            </Button>
          </>
        ) : (
          <>
            {devCode && (
              <div className="mb-3 text-sm bg-loom-cotton rounded-[14px] p-2 text-loom-indigo">
                (demo) OTP: <b className="text-lg">{devCode}</b>
              </div>
            )}
            <Field
              label={t("enterCode")}
              value={code}
              inputMode="numeric"
              onChange={(e) => setCode(e.target.value)}
            />
            <Button className="w-full" onClick={verify} disabled={code.length < 4}>
              {t("verify")}
            </Button>
          </>
        )}
        {err && <div className="mt-3 text-loom-madder text-sm">{err}</div>}
      </Card>
    </div>
  );
}
