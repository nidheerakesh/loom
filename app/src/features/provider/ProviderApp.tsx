import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../auth";
import { TabBar } from "../../ui";
import { ProviderCurrent } from "./Current";
import { ProviderRequests } from "./Requests";
import { ProviderProfile } from "./Profile";
import { ProviderOnboarding } from "./Onboarding";
import { ProviderMyWork } from "./MyWork";
import { Communities } from "../shared/Communities";

type SkillRow = { _id: string };

export function ProviderApp() {
  const { t, token } = useAuth();
  const [tab, setTab] = useState("current");
  const [skippedOnboarding, setSkippedOnboarding] = useState(false);

  // A provider with no skills cannot appear in any skill-filtered search, so a fresh signup
  // would land on an empty dashboard with nothing explaining why. Send them through
  // onboarding once instead; `skippedOnboarding` lets them dismiss it for this session.
  const { data: skills } = useQuery({
    queryKey: ["mySkills", token],
    queryFn: () => apiGet<SkillRow[]>("/api/skills/mine", { token: token! }),
    enabled: !!token,
  });

  if (skills !== undefined && skills.length === 0 && !skippedOnboarding) {
    return <ProviderOnboarding onDone={() => setSkippedOnboarding(true)} />;
  }

  return (
    <>
      {tab === "current" && <ProviderCurrent />}
      {tab === "requests" && <ProviderRequests />}
      {tab === "mywork" && <ProviderMyWork />}
      {tab === "communities" && <Communities />}
      {tab === "profile" && <ProviderProfile />}
      <TabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "current", label: t("current") },
          { key: "requests", label: t("requests") },
          { key: "mywork", label: t("myWork") },
          { key: "communities", label: t("communities") },
          { key: "profile", label: t("profile") },
        ]}
      />
    </>
  );
}
