import "server-only";
import { auditEvents } from "@/server/db/schema";
import type { Db, Tx } from "@/server/db";

export type AuditInput = {
  organizationId: string | null;
  actorUserId: string | null;
  actorLabel: string;
  action: string;
  summary: string;
  objectType?: string;
  objectId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Append an audit event. Server-generated only; the table is append-only at the
 * database level. Metadata must never contain secrets or free-text matter content.
 */
export async function audit(db: Db | Tx, e: AuditInput) {
  await db.insert(auditEvents).values({
    organizationId: e.organizationId,
    actorUserId: e.actorUserId,
    actorLabel: e.actorLabel,
    action: e.action,
    summary: e.summary,
    objectType: e.objectType,
    objectId: e.objectId,
    metadata: e.metadata ?? {},
  });
}
