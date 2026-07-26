import { useState } from "react";
import { useAuth } from "../../auth";
import { TabBar } from "../../ui";
import { ProviderCurrent } from "./Current";
import { ProviderRequests } from "./Requests";
import { ProviderProfile } from "./Profile";
import { Communities } from "../shared/Communities";

export function ProviderApp() {
  const { t } = useAuth();
  const [tab, setTab] = useState("current");
  return (
    <>
      {tab === "current" && <ProviderCurrent />}
      {tab === "requests" && <ProviderRequests />}
      {tab === "communities" && <Communities />}
      {tab === "profile" && <ProviderProfile />}
      <TabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "current", label: t("current"), icon: "📋" },
          { key: "requests", label: t("requests"), icon: "📨" },
          { key: "communities", label: t("communities"), icon: "💬" },
          { key: "profile", label: t("profile"), icon: "👤" },
        ]}
      />
    </>
  );
}
