import { and, desc, eq, inArray } from "drizzle-orm";
import { Shell } from "@/components/app/Shell";
import { listMemberships, pageOrgContext } from "@/server/auth/session";
import { withTenant } from "@/server/db";
import { auditEvents, notificationReads } from "@/server/db/schema";
import { getInbox } from "@/server/services/workflow";
import { ago } from "@/lib/format";

const ACTIVITY_ACTIONS = ["import.completed", "import.started", "prediction.created", "prediction.revised", "assessment.reaffirmed", "outcome.recorded", "team.joined", "team.invited", "event.created", "offer.recorded", "rule.created", "decision.recorded", "moment.created", "inbox.assigned"];

export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const ctx = await pageOrgContext();
  const [memberships, inbox] = [await listMemberships(ctx.user.id), await getInbox(ctx)];
  const watchCount = new Set(inbox.items.map((i) => i.matterId)).size;
  const { events, lastRead } = await withTenant(ctx.org.id, async (tx) => {
    const events = await tx.select().from(auditEvents)
      .where(and(eq(auditEvents.organizationId, ctx.org.id), inArray(auditEvents.action, ACTIVITY_ACTIONS)))
      .orderBy(desc(auditEvents.createdAt)).limit(25);
    const r = (await tx.select().from(notificationReads).where(and(eq(notificationReads.userId, ctx.user.id), eq(notificationReads.organizationId, ctx.org.id))).limit(1))[0];
    return { events, lastRead: r?.lastReadAt ?? new Date(0) };
  });
  return (
    <Shell
      user={{ name: ctx.user.name, email: ctx.user.isDemoUser ? "Demo access" : ctx.user.email }}
      org={{ id: ctx.org.id, name: ctx.org.name, isDemo: ctx.org.isDemo, deletionOn: ctx.org.deletionRequestedAt ? new Date(ctx.org.deletionRequestedAt.getTime() + 30 * 86400_000).toISOString().slice(0, 10) : null }}
      role={ctx.role}
      memberships={memberships}
      watchCount={watchCount}
      canAudit={ctx.can("audit.view")}
      activity={events.map((e) => ({ id: e.id, summary: e.summary, actor: e.actorLabel, at: ago(e.createdAt) }))}
      unread={events.filter((e) => e.createdAt > lastRead && e.actorUserId !== ctx.user.id).length}
    >
      {children}
    </Shell>
  );
}
