import { pageOrgContext } from "@/server/auth/session";
import { PageHead } from "@/components/ui/Blocks";
import { SettingsTabs } from "./SettingsTabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await pageOrgContext("/app/settings/profile");
  const tabs = [
    { href: "/app/settings/profile", label: "Profile" },
    { href: "/app/settings/security", label: "Security" },
    { href: "/app/settings/organization", label: "Organization" },
    ...(ctx.can("team.view") ? [{ href: "/app/settings/team", label: "Team" }] : []),
    ...(ctx.can("data.export") || ctx.can("org.delete") ? [{ href: "/app/settings/data", label: "Data" }] : []),
  ];
  return (
    <>
      <PageHead title="Settings" sub={ctx.org.name} />
      <SettingsTabs tabs={tabs} />
      <div style={{ maxWidth: 860 }}>{children}</div>
    </>
  );
}
