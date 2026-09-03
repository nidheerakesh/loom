import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../auth";
import { Button } from "../../ui";
import { currentPosition } from "../../lib/geo";

type Area = { _id: string; label: string };

// Both ways of saying where you are, side by side.
//
// The list is not hidden behind a failure. A woman who does not want to grant location
// permission — a reasonable thing not to want — should not have to trigger and then refuse a
// system prompt before the app will offer her the alternative. So both are visible from the
// start, and refusing the prompt just leaves the list where it already was.
export function LocationPicker({
  current,
  onSaved,
}: {
  current?: string | null;
  onSaved?: (label: string) => void;
}) {
  const { token, t } = useAuth();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(current ?? null);

  const { data: areas } = useQuery({
    queryKey: ["locations/list"],
    queryFn: () => apiGet<Area[]>("/api/locations/list", {}),
  });

  const save = async (body: Record<string, unknown>) => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await apiPost<{ label: string }>("/api/accounts/set-location", { token, ...body });
      setSaved(res.label);
      setNote(null);
      onSaved?.(res.label);
    } catch {
      setNote(t("locationDenied"));
    } finally {
      setBusy(false);
    }
  };

  const detectLocation = async () => {
    setBusy(true);
    setNote(t("locating"));
    const fix = await currentPosition();
    if (!fix.ok) {
      setNote(t("locationDenied"));
      setBusy(false);
      return;
    }
    await save({ lat: fix.lat, lng: fix.lng });
  };

  return (
    <div>
      <div className="text-sm text-loom-indigoSoft mb-2">{t("whyLocation")}</div>

      <Button variant="ghost" className="w-full mb-2" disabled={busy} onClick={() => void detectLocation()}>
        {busy ? t("locating") : t("useMyLocation")}
      </Button>

      {note && <div className="text-sm text-loom-madder mb-2">{note}</div>}
      {saved && !note && (
        <div className="text-sm text-loom-leaf mb-2">
          {t("locationSaved")} — {saved}
        </div>
      )}

      <div className="text-sm text-loom-indigoSoft mb-1">{t("orPickArea")}</div>
      <div className="flex flex-wrap gap-2">
        {(areas ?? []).map((a) => (
          <button
            key={a._id}
            disabled={busy}
            onClick={() => void save({ locationId: a._id })}
            className={`min-h-[56px] px-4 rounded-[14px] border text-sm ${
              saved === a.label
                ? "bg-loom-indigo text-loom-cotton border-loom-indigo"
                : "bg-loom-cotton text-loom-indigo border-loom-cottonDeep"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
