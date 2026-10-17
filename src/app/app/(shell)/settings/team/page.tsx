import type { Metadata } from "next";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { pageOrgContext } from "@/server/auth/session";
import { systemDb, withTenant } from "@/server/db";
import { invitations, memberships, users } from "@/server/db/schema";
import { Card, Empty } from "@/components/ui/Blocks";
import { InviteForm, MemberControls, RevokeInviteButton } from "@/components/app/SettingsForms";
import { assignableRoles, ROLE_LABEL } from "@/lib/roles";
import { ago, date } from "@/lib/format";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await pageOrgContext("/app/settings/team");
  if (!ctx.can("team.view")) return <Empty title="Not available for your role">Team membership is not visible to this role.</Empty>;
  const manage = ctx.can("team.manage") && !ctx.org.isDemo;
  const roles = manage ? assignableRoles(ctx.role) : [];
  const members = await systemDb().select({ id: memberships.id, role: memberships.role, userId: users.id, name: users.name, email: users.email, lastLoginAt: users.lastLoginAt, mfa: users.mfaEnabled, isDemoUser: users.isDemoUser })
    .from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.organizationId, ctx.org.id)).orderBy(asc(users.name));
  const invites = manage ? await withTenant(ctx.org.id, (tx) => tx.select().from(invitations).where(and(eq(invitations.organizationId, ctx.org.id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())))) : [];
  const visible = members.filter((m) => !m.isDemoUser && m.role !== "demo");
  return (
    <div className="stack-lg">
      {manage ? <Card title="Invite a colleague" sub="Invitations expire after 7 days. Invitees set their own password."><InviteForm roles={roles} /></Card> : null}
      <Card title={`Members (${visible.length})`} pad={false}>
        {visible.length ? (
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="table">
              <caption className="sr-only">Members</caption>
              <thead><tr><th>Name</th><th>Two-factor</th><th>Last sign-in</th><th className="r">Role</th></tr></thead>
              <tbody>{visible.map((m) => (
                <tr key={m.id}>
                  <td><div className="cell-primary">{m.name}{m.userId === ctx.user.id ? " (you)" : ""}</div><span className="cell-sub">{m.email}</span></td>
                  <td>{m.mfa ? <span className="pos">✓ On</span> : <span className="muted">Off</span>}</td>
                  <td className="ink2">{m.lastLoginAt ? ago(m.lastLoginAt) : "Never"}</td>
                  <td className="r"><MemberControls membershipId={m.id} role={m.role} roles={roles} self={m.userId === ctx.user.id} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <div className="card-body muted">{ctx.org.isDemo ? "The demonstration organization has no real members. Its attorneys are synthetic." : "No members."}</div>}
      </Card>
      {invites.length ? (
        <Card title="Pending invitations" pad={false}>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="table"><tbody>{invites.map((i) => (
              <tr key={i.id}><td className="cell-primary">{i.email}</td><td className="ink2">{ROLE_LABEL[i.role]}</td><td className="ink2">Expires {date(i.expiresAt)}</td><td className="r"><RevokeInviteButton id={i.id} /></td></tr>
            ))}</tbody></table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
