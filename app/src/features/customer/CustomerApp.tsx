import { useState } from "react";
import { useAuth } from "../../auth";
import { TabBar } from "../../ui";
import { Browse } from "./Browse";
import { RequestForm } from "./RequestForm";
import { Accepted } from "./Accepted";
import { CustomerProfile } from "./Profile";

export function CustomerApp() {
  const { t } = useAuth();
  const [tab, setTab] = useState("browse");
  return (
    <>
      {tab === "browse" && <Browse />}
      {tab === "request" && <RequestForm onDone={() => setTab("accepted")} />}
      {tab === "accepted" && <Accepted />}
      {tab === "profile" && <CustomerProfile />}
      <TabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "browse", label: t("browse") },
          { key: "request", label: t("request") },
          { key: "accepted", label: t("accepted") },
          { key: "profile", label: t("profile") },
        ]}
      />
    </>
  );
}
