import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../auth";
import { Button, Card, Field, TextButton } from "../../ui";

type Candidate = { id: string; name: string };
type ProviderOption = { _id: string; name: string; shopName: string | null };

// The step that happens AFTER a group order is staffed, not before it: now that the team
// actually exists (and, in practice, has talked to each other about the work), the customer
// settles who's coordinating it and what it really pays — replacing whatever "expected price"
// she put at posting time with the number the team actually agreed to.
//
// Reused by both staffing paths (auto-assembly's TeamDetail and the open call's
// GroupApplicants), which otherwise share nothing — this is the one screen both funnel into
// once a team exists.
export function FinalizeGroup({
  requestId,
  candidates,
  initialRate,
  initialRateUnit,
  onDone,
}: {
  requestId: string;
  candidates: Candidate[];
  initialRate: number | null;
  initialRateUnit: string | null;
  onDone: () => void;
}) {
  const { token, t } = useAuth();
  const [coordinator, setCoordinator] = useState<"myself" | { id: string; name: string } | null>("myself");
  const [searching, setSearching] = useState(false);
  const { data: providerOptions } = useQuery({
    queryKey: ["providers/search", token],
    queryFn: () => apiGet<ProviderOption[]>("/api/providers/search", { token: token! }),
    enabled: !!token && searching,
  });
  const [rate, setRate] = useState<number | "">(initialRate ?? "");
  const [rateUnit, setRateUnit] = useState(initialRateUnit ?? "");

  const finalize = useMutation({
    mutationFn: () =>
      apiPost("/api/requests/set-coordinator", {
        token,
        requestId,
        coordinatorRole: coordinator === "myself" || !coordinator ? "customer" : "provider",
        coordinatorProviderId:
          coordinator === "myself" || !coordinator ? undefined : coordinator.id,
        agreedRate: rate === "" ? undefined : Number(rate),
        agreedRateUnit: rateUnit.trim() ? rateUnit.trim() : undefined,
      }),
    onSuccess: onDone,
  });

  return (
    <Card className="mb-2">
      <h3 className="font-semibold text-loom-indigo mb-1">{t("finalizeGroup")}</h3>
      <p className="text-sm text-loom-indigoSoft mb-3">{t("finalizeGroupHint")}</p>

      <div className="text-sm text-loom-indigoSoft mb-1">{t("coordinator")}</div>
      <div className="flex flex-wrap gap-2 mb-2">
        <Button
          variant={coordinator === "myself" ? "primary" : "ghost"}
          onClick={() => {
            setCoordinator("myself");
            setSearching(false);
          }}
        >
          {t("coordinatorMyself")}
        </Button>
        {candidates.map((c) => (
          <Button
            key={c.id}
            variant={typeof coordinator === "object" && coordinator?.id === c.id ? "primary" : "ghost"}
            onClick={() => {
              setCoordinator(c);
              setSearching(false);
            }}
          >
            {c.name}
          </Button>
        ))}
        <Button
          variant={searching ? "primary" : "ghost"}
          onClick={() => setSearching(true)}
        >
          {t("coordinatorSomeoneElse")}
        </Button>
      </div>
      {searching && (
        <div className="max-h-40 overflow-y-auto border border-loom-line rounded-[14px] mb-3">
          {providerOptions === undefined && <div className="p-3 text-loom-indigoSoft text-sm">…</div>}
          {providerOptions?.map((p) => (
            <button
              key={p._id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-loom-cottonDeep"
              onClick={() => {
                setCoordinator({ id: p._id, name: p.shopName ?? p.name });
                setSearching(false);
              }}
            >
              {p.shopName ?? p.name}
            </button>
          ))}
        </div>
      )}
      {typeof coordinator === "object" && coordinator && (
        <div className="text-sm text-loom-indigo mb-2">
          {t("coordinatorAppointed")}: {coordinator.name}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3">
        <Field
          label={t("agreedRate")}
          type="number"
          value={rate}
          onChange={(e) => setRate(e.target.value === "" ? "" : Number(e.target.value))}
        />
        <Field
          label={t("agreedRateUnit")}
          placeholder="piece"
          value={rateUnit}
          onChange={(e) => setRateUnit(e.target.value)}
        />
      </div>

      <Button
        variant="leaf"
        className="w-full"
        disabled={finalize.isPending}
        onClick={() => finalize.mutate()}
      >
        {t("finalizeGroup")}
      </Button>
      {finalize.isError && (
        <div className="text-loom-madder text-sm mt-2">{finalize.error.message}</div>
      )}
      <TextButton className="mt-2 w-full" onClick={onDone}>
        {t("skipForNow")}
      </TextButton>
    </Card>
  );
}
