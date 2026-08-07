import { useState } from "react";
import { apiPost, ApiError } from "../lib/api";
import { useAuth } from "../auth";
import { Button, Card, Field } from "../ui";

type Role = "provider" | "customer";

// Sign-in never asks for a role or a name up front — only a phone number and a code.
// The server resolves the account from the verified number and says what is still missing:
//   session -> straight to the dashboard (the returning-user path)
//   choose  -> the number holds both a provider and a customer account
//   signup  -> new number, so collect a name and a role
type VerifyResult =
  | { status: "session"; token: string }
  | { status: "choose"; ticket: string; roles: Role[] }
  | { status: "signup"; ticket: string };

type Step = "phone" | "code" | "choose" | "signup";

export function SignIn() {
  const { setToken, t, lang, setLang } = useAuth();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [ticket, setTicket] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("provider");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const res = await apiPost<{ devCode: string | null }>("/api/auth/request-otp", { phone });
      setDevCode(res.devCode);
      setStep("code");
    });

  const verify = () =>
    run(async () => {
      const res = await apiPost<VerifyResult>("/api/auth/verify-otp", { phone, code });
      if (res.status === "session") {
        setToken(res.token);
        return;
      }
      setTicket(res.ticket);
      if (res.status === "choose") {
        setRoles(res.roles);
        setStep("choose");
      } else {
        setStep("signup");
      }
    });

  const completeLogin = (chosen: Role, withName?: string) =>
    run(async () => {
      const res = await apiPost<{ token: string }>("/api/auth/complete-login", {
        ticket,
        role: chosen,
        name: withName,
      });
      setToken(res.token);
    });

  const restart = () => {
    setStep("phone");
    setCode("");
    setDevCode(null);
    setTicket("");
    setErr(null);
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
        {step === "phone" && (
          <>
            <Field
              label={t("phone")}
              value={phone}
              inputMode="tel"
              autoFocus
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9876500000"
            />
            <Button className="w-full" onClick={sendCode} disabled={!phone || busy}>
              {t("sendCode")}
            </Button>
          </>
        )}

        {step === "code" && (
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
              autoFocus
              onChange={(e) => setCode(e.target.value)}
            />
            <Button className="w-full" onClick={verify} disabled={code.length < 4 || busy}>
              {t("verify")}
            </Button>
            <button className="mt-3 w-full text-sm underline text-loom-indigoSoft" onClick={restart}>
              {t("changeNumber")}
            </button>
          </>
        )}

        {/* Only reachable when one number holds both a provider and a customer account. */}
        {step === "choose" && (
          <>
            <div className="mb-3 text-loom-indigo font-medium">{t("continueAs")}</div>
            <div className="flex gap-2">
              {roles.map((r) => (
                <Button key={r} className="flex-1" disabled={busy} onClick={() => completeLogin(r)}>
                  {t(r)}
                </Button>
              ))}
            </div>
          </>
        )}

        {step === "signup" && (
          <>
            <div className="mb-3 text-loom-indigo font-medium">{t("welcome")}</div>
            <Field
              label={t("name")}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
            <span className="block text-sm text-loom-indigoSoft mb-1">{t("iAmA")}</span>
            <div className="flex gap-2 mb-4">
              <Button
                variant={role === "provider" ? "primary" : "ghost"}
                className="flex-1"
                onClick={() => setRole("provider")}
              >
                {t("provider")}
              </Button>
              <Button
                variant={role === "customer" ? "primary" : "ghost"}
                className="flex-1"
                onClick={() => setRole("customer")}
              >
                {t("customer")}
              </Button>
            </div>
            <Button
              className="w-full"
              onClick={() => completeLogin(role, name.trim())}
              disabled={!name.trim() || busy}
            >
              {t("continue")}
            </Button>
          </>
        )}

        {err && <div className="mt-3 text-loom-madder text-sm">{err}</div>}
      </Card>
    </div>
  );
}
