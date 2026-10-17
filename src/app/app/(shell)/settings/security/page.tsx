import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { pageOrgContext } from "@/server/auth/session";
import { systemDb } from "@/server/db";
import { sessions } from "@/server/db/schema";
import { Card } from "@/components/ui/Blocks";
import { MfaPanel, RevokeOthersButton, SessionRow } from "@/components/app/SettingsForms";
import { ago } from "@/lib/format";

export const metadata: Metadata = { title: "Security" };

function device(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "";
  return `${browser}${os ? ` on ${os}` : ""}`;
}

export default async function SecurityPage() {
  const ctx = await pageOrgContext("/app/settings/security");
  if (ctx.user.isDemoUser) return <div className="alert alert-info"><span>Security settings are not available on the shared demonstration account.</span></div>;
  const rows = await systemDb().select().from(sessions).where(eq(sessions.userId, ctx.user.id)).orderBy(desc(sessions.lastSeenAt)).limit(20);
  return (
    <div className="stack-lg">
      <Card title="Two-factor authentication"><MfaPanel enabled={ctx.user.mfaEnabled} /></Card>
      <Card title="Active sessions" sub="Sessions end after 12 hours of inactivity and always after 14 days." pad={false} actions={rows.length > 1 ? <RevokeOthersButton /> : null}>
        <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="table">
            <caption className="sr-only">Active sessions</caption>
            <tbody>
              {rows.map((s) => <SessionRow key={s.id} id={s.id} current={s.id === ctx.sessionId} label={device(s.userAgent)} sub={`Signed in ${ago(s.createdAt)} · last active ${ago(s.lastSeenAt)}`} />)}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
