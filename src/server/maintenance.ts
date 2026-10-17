import "server-only";
import { and, eq, isNotNull, lt, or, sql } from "drizzle-orm";
import { systemDb } from "@/server/db";
import { authTokens, importFiles, imports, organizations, rateLimits, sessions } from "@/server/db/schema";
import { logger } from "@/server/logger";

export const DELETION_GRACE_DAYS = 30;

/**
 * Permanently deletes organizations whose deletion was requested more than the grace period ago.
 * All tenant tables cascade from organizations; app.allow_purge lets the append-only triggers
 * on predictions and audit events permit the cascade inside this transaction only.
 */
export async function purgeDeletedOrganizations(now = new Date()) {
  const cutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * 86400_000);
  const due = await systemDb().select({ id: organizations.id, name: organizations.name }).from(organizations)
    .where(and(isNotNull(organizations.deletionRequestedAt), lt(organizations.deletionRequestedAt, cutoff), eq(organizations.isDemo, false)));
  for (const org of due) {
    await systemDb().transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.allow_purge', 'on', true)`);
      await tx.update(sessions).set({ activeOrganizationId: null }).where(eq(sessions.activeOrganizationId, org.id));
      await tx.delete(organizations).where(eq(organizations.id, org.id));
    });
    // Organization names are customer data; log only the identifier.
    logger.info("org.purged", { orgId: org.id });
  }
  return { purged: due.length };
}

/** Removes expired sessions and tokens, stale rate-limit windows, and files of abandoned imports. */
export async function cleanupExpired(now = new Date()) {
  const db = systemDb();
  const s = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ id: sessions.id });
  const t = await db.delete(authTokens).where(or(lt(authTokens.expiresAt, now), isNotNull(authTokens.usedAt))).returning({ id: authTokens.id });
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - 2 * 86400_000)));
  // Uploaded files for imports never committed within 14 days are deleted; the import record remains.
  const stale = await db.select({ id: imports.id }).from(imports).where(and(lt(imports.createdAt, new Date(now.getTime() - 14 * 86400_000)), sql`${imports.status} not in ('completed')`));
  for (const i of stale) await db.delete(importFiles).where(eq(importFiles.importId, i.id));
  await db.update(imports).set({ status: "cancelled" }).where(and(lt(imports.createdAt, new Date(now.getTime() - 14 * 86400_000)), sql`${imports.status} in ('uploaded','mapped','reviewing')`));
  return { sessions: s.length, tokens: t.length, staleImports: stale.length };
}
