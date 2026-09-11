import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "../../lib/api";
import { useAuth } from "../../auth";
import { Button, Card, Field } from "../../ui";

type Candidate = { id: string; name: string };
type PhoneLookupResult = { _id: string; name: string; shopName: string | null } | null;

// The step that happens AFTER a group order is staffed, not before it: now that the team
// actually exists (and, in practice, has talked to each other about the work), the customer
// settles who's coordinating it and what it really pays — replacing whatever "expected price"
// she put at posting time with the number the team actually agreed to.
//
// Coordinator choices are deliberately narrow: someone already on the team (`candidates`), or
// someone named by phone number (`providers/find-by-phone`) — never a browsable list of every
// provider in the app. That list used to be here and was the bug: it let a random uninvolved
// provider be appointed as easily as an actual team member, because both looked like items in
// the same list. A phone number is something she already has to know about the person she
// means to name; nobody ends up coordinating a job by accident.
//
// Reused by both staffing paths (auto-assembly's TeamDetail and the open call's
// GroupApplicants), which otherwise share nothing — this is the one screen both funnel into
// once a team exists.
export function FinalizeGroup({
  requestId,
  candidates,
  declinedIds,
  initialRate,
  initialRateUnit,
  onDone,
}: {
  requestId: string;
  candidates: Candidate[];
  declinedIds: string[];
  initialRate: number | null;
  initialRateUnit: string | null;
  onDone: () => void;
}) {
  const { token, t } = useAuth();
  const [coordinator, setCoordinator] = useState<"myself" | { id: string; name: string } | null>("myself");
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<{ status: "not-found" | "declined"; name?: string } | null>(null);
  const [rate, setRate] = useState<number | "">(initialRate ?? "");
  const [rateUnit, setRateUnit] = useState(initialRateUnit ?? "");
  const visibleCandidates = candidates.filter((c) => !declinedIds.includes(c.id));

  const findByPhone = useMutation({
    mutationFn: () => apiPost<PhoneLookupResult>("/api/providers/find-by-phone", { token, phone: phone.trim() }),
    onSuccess: (found) => {
      if (!found) {
        setLookup({ status: "not-found" });
        return;
      }
      if (declinedIds.includes(found._id)) {
        setLookup({ status: "declined", name: found.shopName ?? found.name });
        return;
      }
      setCoordinator({ id: found._id, name: found.shopName ?? found.name });
      setLookup(null);
      setPhone("");
    },
  });

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
          onClick={() => setCoordinator("myself")}
        >
          {t("coordinatorMyself")}
        </Button>
        {visibleCandidates.map((c) => (
          <Button
            key={c.id}
            variant={typeof coordinator === "object" && coordinator?.id === c.id ? "primary" : "ghost"}
            onClick={() => setCoordinator(c)}
          >
            {c.name}
          </Button>
        ))}
      </div>

      <div className="text-sm text-loom-indigoSoft mb-1">{t("coordinatorByPhone")}</div>
      <div className="flex gap-2 mb-1">
        <div className="flex-1">
          <Field
            className="mb-0"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setLookup(null);
            }}
            placeholder={t("phone")}
          />
        </div>
        <Button
          variant="ghost"
          disabled={!phone.trim() || findByPhone.isPending}
          onClick={() => findByPhone.mutate()}
        >
          {t("findCoordinator")}
        </Button>
      </div>
      {lookup?.status === "not-found" && (
        <div className="text-sm text-loom-madder mb-2">{t("coordinatorNotFound")}</div>
      )}
      {lookup?.status === "declined" && (
        <div className="text-sm text-loom-madder mb-2">
          {lookup.name} {t("coordinatorAlreadyDeclined")}
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
    </Card>
  );
}
