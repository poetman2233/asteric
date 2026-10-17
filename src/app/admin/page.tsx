import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { count, desc, eq, sql } from "drizzle-orm";
import { getSession } from "@/server/auth/session";
import { rlsStatus, systemDb } from "@/server/db";
import { accessRequests, matters, memberships, organizations } from "@/server/db/schema";
import { config } from "@/server/config";
import { Wordmark } from "@/components/ui/Brand";
import { Card, Kpi } from "@/components/ui/Blocks";
import { CancelDeletionButton, ProvisionForm, DeclineButton, RegenerateDemoButton } from "./AdminForms";
import { logoutAction } from "@/app/(auth)/actions";
import { date, num } from "@/lib/format";

export const metadata: Metadata = { title: "Administration" };
export const maxDuration = 60;

/**
 * Platform administration. Deliberately shows only organization metadata and counts:
 * administrators are not members of customer organizations and cannot open their matters.
 */
export default async function AdminPage() {
  const s = await getSession();
  if (!s) redirect("/login?next=/admin");
  if (s.mfaPending) redirect("/login/mfa");
  if (!s.user.isPlatformAdmin) redirect("/app");
  const db = systemDb();
  const orgs = await db.select({
    id: organizations.id, name: organizations.name, isDemo: organizations.isDemo, createdAt: organizations.createdAt, deletionRequestedAt: organizations.deletionRequestedAt,
    members: sql<number>`(select count(*) from ${memberships} where ${memberships.organizationId} = ${organizations.id})`.mapWith(Number),
    matterCount: sql<number>`(select count(*) from ${matters} where ${matters.organizationId} = ${organizations.id})`.mapWith(Number),
  }).from(organizations).orderBy(desc(organizations.createdAt));
  const requests = await db.select().from(accessRequests).orderBy(desc(accessRequests.createdAt)).limit(100);
  const openRequests = requests.filter((r) => r.status === "new");
  const rls = await rlsStatus();
  const pending = Number((await db.select({ n: count() }).from(accessRequests).where(eq(accessRequests.status, "new")))[0]?.n ?? 0);

  return (
    <div style={{ minHeight: "100vh", background: "var(--canvas)" }}>
      <header className="row" style={{ justifyContent: "space-between", padding: "18px 28px", borderBottom: "1px solid var(--line)", background: "var(--surface)" }}>
        <span className="row" style={{ gap: 12 }}><Wordmark /> <span className="badge">Administration</span></span>
        <span className="row" style={{ gap: 12 }}><span className="help">{s.user.email}</span><form action={logoutAction}><button className="btn btn-ghost btn-sm" type="submit">Sign out</button></form></span>
      </header>
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 24px 80px" }} className="stack-lg">
        <div className="alert alert-info"><span>Administrators see organization metadata and counts only. Customer matters, predictions and outcomes are visible only to members of each organization.</span></div>
        <div className="kpis">
          <Kpi label="Organizations" value={num(orgs.filter((o) => !o.isDemo).length)} foot="Excluding the demo workspace" />
          <Kpi label="Open access requests" value={num(pending)} />
          <Kpi label="Tenant isolation" value={rls.active ? "RLS enforced" : "App-layer only"} foot={rls.active ? "Queries run as the non-bypass role" : "Database user cannot create the asteric_app role; see docs"} />
          <Kpi label="Email" value={config.emailConfigured ? "Configured" : "Not configured"} foot={config.emailConfigured ? "Invitations are emailed" : "Links are shown to admins instead"} />
        </div>

        <Card title="Provision an organization" sub="Creates an empty workspace and invites its first owner. You will not be a member.">
          <ProvisionForm />
        </Card>

        <Card title={`Access requests (${openRequests.length} open)`} pad={false}>
          {requests.length ? (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="table">
                <thead><tr><th>Received</th><th>Contact</th><th>Firm</th><th>Message</th><th>Status</th><th style={{ minWidth: 420 }}>Action</th></tr></thead>
                <tbody>{requests.map((r) => (
                  <tr key={r.id}>
                    <td className="ink2">{date(r.createdAt)}</td>
                    <td><div className="cell-primary">{r.name}</div><span className="cell-sub">{r.email}{r.role ? ` · ${r.role}` : ""}</span></td>
                    <td>{r.firm}{r.firmSize ? <span className="cell-sub" style={{ display: "block" }}>{r.firmSize}</span> : null}</td>
                    <td className="ink2" style={{ whiteSpace: "normal", maxWidth: 260 }}>{r.kind === "contact" ? "Contact: " : ""}{r.message?.slice(0, 280) ?? "—"}</td>
                    <td><span className={`badge${r.status === "approved" ? " badge-pos" : r.status === "new" ? " badge-accent" : ""}`}>{r.status}</span></td>
                    <td>{r.status === "new" && r.kind !== "contact" ? <div className="row" style={{ gap: 6, alignItems: "flex-start" }}><div style={{ flex: 1 }}><ProvisionForm compact firm={r.firm} email={r.email} requestId={r.id} /></div><DeclineButton id={r.id} /></div> : r.status === "new" ? <DeclineButton id={r.id} /> : null}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="card-body muted">No requests yet. Submissions from the public Request access and Contact pages appear here.</div>}
        </Card>

        <Card title="Organizations" pad={false}>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="table">
              <thead><tr><th>Name</th><th>Created</th><th className="r">Members</th><th className="r">Matters</th><th>Status</th></tr></thead>
              <tbody>{orgs.map((o) => (
                <tr key={o.id}>
                  <td className="cell-primary">{o.name}{o.isDemo ? <span className="badge" style={{ marginLeft: 8 }}>Synthetic demo</span> : null}</td>
                  <td className="ink2">{date(o.createdAt)}</td>
                  <td className="r">{num(o.members)}</td>
                  <td className="r">{num(o.matterCount)}</td>
                  <td>{o.deletionRequestedAt ? <span className="row" style={{ gap: 8 }}><span className="badge badge-neg">Deletion scheduled {date(new Date(o.deletionRequestedAt.getTime() + 30 * 86400_000))}</span><CancelDeletionButton orgId={o.id} /></span> : <span className="ink2">Active</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
        <Card title="Demonstration workspace" sub={`Synthetic "Keller & Ross Employment Law" data for investor and prospect demos. ${config.demoEnabled ? "Visitors can enter it from the login page." : "Set DEMO_MODE=enabled to offer it on the login page."} It is regenerated automatically every day.`}>
          <RegenerateDemoButton exists={orgs.some((o) => o.isDemo)} />
          <p className="help" style={{ marginTop: 10 }}><Link className="link" href="/login">Open the login page</Link> and choose “Explore the demonstration workspace” to see it as a visitor would.</p>
        </Card>
      </main>
    </div>
  );
}
