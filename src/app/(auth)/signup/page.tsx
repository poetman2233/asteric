import type { Metadata } from "next";
import Link from "next/link";
import { config } from "@/server/config";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const { setup } = await searchParams;
  const adminSetup = Boolean(setup && config.setupToken && setup === config.setupToken);
  if (!adminSetup && config.signupMode !== "open") {
    return (
      <>
        <h1 className="auth-title">Accounts are by invitation</h1>
        <p className="auth-sub">Asteric works with a small number of design-partner firms. Ask your firm&apos;s Asteric administrator for an invitation, or request access for your firm.</p>
        <div className="row"><Link className="btn btn-primary" href="/request-access">Request access</Link><Link className="btn btn-secondary" href="/login">Sign in</Link></div>
      </>
    );
  }
  return (
    <>
      <h1 className="auth-title">{adminSetup ? "Create the administrator account" : "Create your firm's workspace"}</h1>
      <p className="auth-sub">{adminSetup ? "First-run setup. This account administers the Asteric deployment; it does not see customer matter data." : "You will be the owner of your organization's workspace."}</p>
      <SignupForm setup={adminSetup ? setup! : ""} askFirm={!adminSetup} />
    </>
  );
}
