import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession, getOrgContext, listMemberships, AuthError } from "@/server/auth/session";
import { config } from "@/server/config";
import { Wordmark } from "@/components/ui/Brand";
import { Onboarding } from "./Onboarding";

export const metadata: Metadata = { title: "Set up your workspace" };

export default async function OnboardingPage() {
  const s = await getSession();
  if (!s) redirect("/login?next=/app/onboarding");
  if (s.mfaPending) redirect("/login/mfa");
  const real = (await listMemberships(s.userId)).filter((m) => !m.isDemo);
  let org: { name: string; practiceArea: string | null; attorneyCount: string | null; matterVolume: string | null; caseManagementSystem: string | null } | null = null;
  if (real.length) {
    try {
      const ctx = await getOrgContext();
      if (ctx.org.isDemo || !ctx.can("org.manage") || ctx.org.onboardingCompletedAt) redirect("/app");
      org = { name: ctx.org.name, practiceArea: ctx.org.practiceArea, attorneyCount: null, matterVolume: null, caseManagementSystem: null };
    } catch (e) {
      if (!(e instanceof AuthError)) throw e;
    }
  }
  return (
    <div style={{ minHeight: "100vh", background: "var(--canvas)" }}>
      <header style={{ padding: "22px 28px" }}><Wordmark /></header>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 20px 80px" }}>
        <Onboarding userName={s.user.name} org={org} demoAvailable={config.demoEnabled} />
      </main>
    </div>
  );
}
