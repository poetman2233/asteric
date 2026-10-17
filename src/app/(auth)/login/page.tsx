import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { config } from "@/server/config";
import { DemoForm, LoginForm } from "./LoginForms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const s = await getSession();
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/app";
  if (s && !s.mfaPending) redirect(next);
  if (s?.mfaPending) redirect("/login/mfa");
  const notice = sp.reset ? "Your password was updated. Sign in with your new password." : sp.signed_out ? "You have been signed out." : sp.verified ? "Email verified. You can now sign in." : sp.expired ? "Your session expired. Please sign in again." : undefined;
  return (
    <>
      <h1 className="auth-title">Sign in</h1>
      <p className="auth-sub">Access your organization&apos;s decision ledger.</p>
      <LoginForm next={next} notice={notice} />
      {config.demoEnabled ? (
        <>
          <div className="row" style={{ margin: "26px 0 18px", gap: 12 }}>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
            <span className="help">or</span>
            <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
          </div>
          <DemoForm needsCode={Boolean(config.demoAccessCode)} />
        </>
      ) : null}
      <p className="help" style={{ marginTop: 26 }}>
        New to Asteric? <a className="link" href="/request-access">Request access</a>
      </p>
    </>
  );
}
