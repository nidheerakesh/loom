import { useState } from "react";
import { apiPost, ApiError } from "../lib/api";
import { useAuth } from "../auth";
import { Button, Card, Field, TextButton } from "../ui";
import { ThemeToggle } from "../components/ThemeToggle";
import { Consent } from "./shared/Consent";

type Role = "provider" | "customer";

// Sign-in never asks for a role or a name up front — only a phone number and a code.
// The server resolves the account from the verified number and says what is still missing:
//   session -> straight to the dashboard (the returning-user path)
//   choose  -> the number holds both a provider and a customer account
//   signup  -> new number, so collect consent, a name and a role
type VerifyResult =
  | { status: "session"; token: string }
  | { status: "choose"; ticket: string; roles: Role[] }
  | { status: "signup"; ticket: string };

type Step = "phone" | "code" | "choose" | "consent" | "signup";

// The server's English message is the fallback; its `reason` is what gets translated. A woman
// signing in reads Malayalam, and "wrong code" and "expired code" ask her to do different
// things — one to look again, one to stop looking and request another.
const REASON_KEYS: Record<string, string> = {
  "wrong-code": "errWrongCode",
  "code-expired": "errCodeExpired",
  "too-many-tries": "errTooManyTries",
  "bad-phone": "errBadPhone",
  "send-failed": "errSendFailed",
  "send-rate-limited": "errTooManyTries",
};

// `onBack` returns to the landing page. Optional because SignIn is also reached directly when a
// stored token turns out to be dead, and there is no landing page to go back to in that case.
export function SignIn({ onBack }: { onBack?: () => void } = {}) {
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
  // The code on her phone can no longer work — expired, or locked by too many tries.
  const [stale, setStale] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError) {
        const key = e.reason ? REASON_KEYS[e.reason] : undefined;
        setErr(key ? t(key) : e.message);
        // A dead code cannot be fixed by retyping it, so stop offering that as the next step.
        setStale(e.reason === "code-expired" || e.reason === "too-many-tries");
      } else {
        setErr(String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      const res = await apiPost<{ devCode: string | null }>("/api/auth/request-otp", { phone });
      setDevCode(res.devCode);
      setCode("");
      setStale(false);
      setStep("code");
    });

  const verify = () =>
    run(async () => {
      const res = await apiPost<VerifyResult>("/api/auth/verify-otp", { phone, code: code.trim() });
      if (res.status === "session") {
        setToken(res.token);
        return;
      }
      setTicket(res.ticket);
      if (res.status === "choose") {
        setRoles(res.roles);
        setStep("choose");
      } else {
        // Consent before name — a returning number never lands here at all, since the server
        // only returns "signup" for a phone with no account yet.
        setStep("consent");
      }
    });

  const completeLogin = (chosen: Role, withName?: string, consent?: true) =>
    run(async () => {
      const res = await apiPost<{ token: string }>("/api/auth/complete-login", {
        ticket,
        role: chosen,
        name: withName,
        consent,
      });
      setToken(res.token);
    });

  const restart = () => {
    setStep("phone");
    setCode("");
    setDevCode(null);
    setTicket("");
    setErr(null);
    setStale(false);
  };

  return (
    <div className="max-w-[520px] mx-auto min-h-screen bg-loom-cotton p-6 flex flex-col justify-center">
      <div className="text-center mb-6">
        <div className="text-4xl font-bold text-loom-indigo">{t("appName")}</div>
        <div className="text-loom-indigoSoft">{t("tagline")}</div>
        <div className="flex items-center justify-center gap-1 mt-2">
          <TextButton onClick={() => setLang(lang === "ml" ? "en" : "ml")}>
            {lang === "ml" ? "English" : "മലയാളം"}
          </TextButton>
          <ThemeToggle />
        </div>
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
            <Button className="w-full" onClick={() => void sendCode()} disabled={!phone || busy}>
              {t("sendCode")}
            </Button>
            {onBack && (
              <TextButton className="mt-3 w-full" onClick={onBack}>
                ‹ {t("back")}
              </TextButton>
            )}
          </>
        )}

        {step === "code" && (
          <>
            {devCode && (
              <div className="mb-3 text-sm bg-loom-cotton rounded-[14px] p-2 text-loom-indigo">
                {t("demoOtp")} <b className="text-lg">{devCode}</b>
              </div>
            )}
            <Field
              label={t("enterCode")}
              value={code}
              inputMode="numeric"
              autoFocus
              onChange={(e) => setCode(e.target.value)}
            />
            {/* Once the code is dead, resending is the only thing that helps — so it becomes
                the primary button and verifying is switched off. */}
            <Button
              className="w-full"
              onClick={() => (stale ? void sendCode() : void verify())}
              disabled={busy || (!stale && code.length < 4)}
            >
              {stale ? t("resendCode") : t("verify")}
            </Button>
            {!stale && (
              <TextButton className="mt-3 w-full" onClick={() => void sendCode()} disabled={busy}>
                {t("resendCode")}
              </TextButton>
            )}
            <TextButton className="mt-3 w-full" onClick={restart}>
              {t("changeNumber")}
            </TextButton>
          </>
        )}

        {/* Only reachable when one number holds both a provider and a customer account. */}
        {step === "choose" && (
          <>
            <div className="mb-3 text-loom-indigo font-medium">{t("continueAs")}</div>
            <div className="flex gap-2">
              {roles.map((r) => (
                <Button key={r} className="flex-1" disabled={busy} onClick={() => void completeLogin(r)}>
                  {t(r)}
                </Button>
              ))}
            </div>
          </>
        )}

        {step === "consent" && (
          <Consent onAgree={() => setStep("signup")} onBack={() => setStep("code")} />
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
              onClick={() => void completeLogin(role, name.trim(), true)}
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
