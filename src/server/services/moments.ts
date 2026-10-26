import "server-only";
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { decisionMoments } from "@/server/db/schema";
import { audit } from "@/server/audit";
import { MOMENT_LABEL, type MomentType } from "@/lib/moments";
import type { OrgContext } from "@/server/auth/session";

/**
 * Single entry point for Decision Moments. Manual entries, procedural events, offers and
 * expenses call this today; a case-management integration would call it the same way.
 */
export async function fireMoment(tx: Tx, ctx: Pick<OrgContext, "org" | "user">, input: {
  matterId: string; matterName: string; type: MomentType; source: "event" | "offer" | "expense" | "manual" | "intake" | "integration";
  eventId?: string | null; offerId?: string | null; note?: string | null;
}) {
  // One open moment of a given type per matter is enough.
  const open = (await tx.select({ id: decisionMoments.id }).from(decisionMoments)
    .where(and(eq(decisionMoments.organizationId, ctx.org.id), eq(decisionMoments.matterId, input.matterId), eq(decisionMoments.type, input.type), eq(decisionMoments.status, "open"))).limit(1))[0];
  if (open) return open.id;
  const [row] = await tx.insert(decisionMoments).values({
    organizationId: ctx.org.id, matterId: input.matterId, type: input.type, source: input.source,
    eventId: input.eventId ?? null, offerId: input.offerId ?? null, note: input.note ?? null, createdBy: ctx.user.id,
  }).returning({ id: decisionMoments.id });
  await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, actorLabel: ctx.user.name, action: "moment.created", objectType: "matter", objectId: input.matterId, summary: `Decision moment on ${input.matterName}: ${MOMENT_LABEL[input.type] ?? input.type}` });
  return row!.id;
}

export async function resolveMoment(tx: Tx, ctx: Pick<OrgContext, "org" | "user">, momentId: string, resolution: "updated" | "no_change" | "dismissed" | "closed", predictionId?: string | null) {
  await tx.update(decisionMoments).set({ status: "resolved", resolution, predictionId: predictionId ?? null, resolvedAt: new Date(), resolvedBy: ctx.user.id })
    .where(and(eq(decisionMoments.id, momentId), eq(decisionMoments.organizationId, ctx.org.id), eq(decisionMoments.status, "open")));
}
