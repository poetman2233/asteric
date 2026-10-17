import "server-only";
import { and, count, desc, eq, like } from "drizzle-orm";
import { withTenant } from "@/server/db";
import { auditEvents } from "@/server/db/schema";
import { AuthError, type OrgContext } from "@/server/auth/session";

export const AUDIT_PAGE = 50;

/** Audit events for the active organization only (RLS also enforces this). */
export async function listAuditEvents(ctx: OrgContext, opts: { page: number; prefix?: string | null }) {
  if (!ctx.can("audit.view")) throw new AuthError("forbidden");
  return withTenant(ctx.org.id, async (tx) => {
    const where = and(eq(auditEvents.organizationId, ctx.org.id), opts.prefix ? like(auditEvents.action, `${opts.prefix}.%`) : undefined);
    const total = (await tx.select({ n: count() }).from(auditEvents).where(where))[0]?.n ?? 0;
    const rows = await tx.select().from(auditEvents).where(where).orderBy(desc(auditEvents.createdAt)).limit(AUDIT_PAGE).offset((opts.page - 1) * AUDIT_PAGE);
    return { total: Number(total), rows };
  });
}
