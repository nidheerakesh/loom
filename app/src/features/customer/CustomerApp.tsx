import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth";
import { Card, Screen, TabBar, TextButton } from "../../ui";
import { LocationPicker } from "../shared/LocationPicker";
import { Browse } from "./Browse";
import { RequestForm } from "./RequestForm";
import { Accepted } from "./Accepted";
import { CustomerProfile } from "./Profile";
import { Communities } from "../shared/Communities";

export function CustomerApp() {
  const { t, token, me } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("browse");
  const [skippedLocation, setSkippedLocation] = useState(false);

  // A customer's location defaults to whatever a hash of her phone number landed on at
  // signup — a real area, but not necessarily anywhere near her, which made every distance
  // in the browse/feed screens arithmetic over a number that meant nothing. Providers get an
  // equivalent first-run prompt already (ProviderApp's skills gate); this is the customer side
  // of the same fix, gated on location_confirmed rather than an empty skill list.
  const customer = me && me.role === "customer" ? me.customer : null;
  if (customer && !customer.locationConfirmed && !skippedLocation) {
    return (
      <Screen title={t("yourArea")}>
        <Card>
          <div className="text-sm text-loom-indigoSoft mb-3">{t("whyLocation")}</div>
          <LocationPicker
            onSaved={() => {
              void queryClient.invalidateQueries({ queryKey: ["me", token] });
            }}
          />
          <TextButton className="mt-3 w-full" onClick={() => setSkippedLocation(true)}>
            {t("skipForNow")}
          </TextButton>
        </Card>
      </Screen>
    );
  }

  return (
    <>
      {tab === "browse" && <Browse />}
      {tab === "request" && <RequestForm onDone={() => setTab("accepted")} />}
      {tab === "accepted" && <Accepted />}
      {tab === "communities" && <Communities />}
      {tab === "profile" && <CustomerProfile />}
      <TabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "browse", label: t("browse") },
          { key: "request", label: t("request") },
          { key: "accepted", label: t("accepted") },
          { key: "communities", label: t("communities") },
          { key: "profile", label: t("profile") },
        ]}
      />
    </>
  );
}
