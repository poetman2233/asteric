import type { Metadata } from "next";
import { pageOrgContext } from "@/server/auth/session";
import { Card } from "@/components/ui/Blocks";
import { PasswordForm, ProfileForm } from "@/components/app/SettingsForms";
import { ROLE_LABEL } from "@/lib/roles";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const ctx = await pageOrgContext("/app/settings/profile");
  const demo = ctx.user.isDemoUser;
  return (
    <div className="stack-lg">
      {demo ? <div className="alert alert-info"><span>You are using the shared demonstration account. Profile and security settings are read-only.</span></div> : null}
      <Card title="Profile" sub={`${ROLE_LABEL[ctx.role]} in ${ctx.org.name}`}><ProfileForm name={ctx.user.name} title={ctx.user.title} email={ctx.user.email} disabled={demo} /></Card>
      {!demo ? <Card title="Password"><PasswordForm /></Card> : null}
    </div>
  );
}
