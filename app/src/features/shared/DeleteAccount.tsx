import { useState } from "react";
import { apiPost, ApiError } from "../../lib/api";
import { useAuth } from "../../auth";
import { Button, Card, Field, TextButton } from "../../ui";

// The one irreversible action in the app. Collapsed by default (a "Delete account" row that
// expands into a confirmation, not a button that fires on the first tap), and the confirmation
// is retyping her own phone number — see api/_routes/accounts/delete.ts for why that specific
// step is what makes a stolen session token insufficient on its own.
export function DeleteAccount() {
  const { token, setToken, t } = useAuth();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!token) return null;

  const confirm = async () => {
    setErr(null);
    setBusy(true);
    try {
      await apiPost("/api/accounts/delete", { token, phone });
      setToken(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e));
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <TextButton className="mt-4 text-loom-madder no-underline" onClick={() => setOpen(true)}>
        {t("deleteAccount")}
      </TextButton>
    );
  }

  return (
    <Card className="mt-4">
      <div className="text-loom-madder font-semibold mb-2">{t("deleteAccount")}</div>
      <p className="text-sm text-loom-ink leading-relaxed mb-3">{t("deleteAccountWarning")}</p>
      <Field
        label={t("retypeNumberToConfirm")}
        value={phone}
        inputMode="tel"
        onChange={(e) => setPhone(e.target.value)}
        placeholder="9876500000"
      />
      <Button
        variant="danger"
        className="w-full"
        disabled={!phone || busy}
        onClick={() => void confirm()}
      >
        {t("deleteForever")}
      </Button>
      <TextButton className="mt-3 w-full" onClick={() => setOpen(false)}>
        {t("cancel")}
      </TextButton>
      {err && <div className="mt-2 text-loom-madder text-sm">{err}</div>}
    </Card>
  );
}
