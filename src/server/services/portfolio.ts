import "server-only";
import { cache } from "react";
import { asc, eq } from "drizzle-orm";
import { withTenant } from "@/server/db";
import { attorneys, categories, matters, outcomes, predictions, proceduralEvents, referralSources } from "@/server/db/schema";
import type { MatterFact, PredictionFact } from "@/lib/analytics/types";

export type Portfolio = {
  facts: MatterFact[];
  attorneys: { id: string; name: string }[];
  categories: { id: string; key: string; label: string }[];
  referrals: { id: string; name: string }[];
  jurisdictions: string[];
};

/**
 * Loads one organization's portfolio as analytics facts. Cached per request; analytics
 * are recomputed from current data on every page load, so they are never stale.
 */
export const loadPortfolio = cache(async (orgId: string): Promise<Portfolio> => {
  return withTenant(orgId, async (tx) => {
    // Sequential: queries share one transaction connection.
    const ms = await tx.select().from(matters).where(eq(matters.organizationId, orgId));
    const ps = await tx.select().from(predictions).where(eq(predictions.organizationId, orgId)).orderBy(asc(predictions.matterId), asc(predictions.version));
    const os = await tx.select().from(outcomes).where(eq(outcomes.organizationId, orgId));
    const es = await tx.select({ matterId: proceduralEvents.matterId, type: proceduralEvents.type, occurredOn: proceduralEvents.occurredOn }).from(proceduralEvents).where(eq(proceduralEvents.organizationId, orgId)).orderBy(asc(proceduralEvents.occurredOn));
    const atts = await tx.select({ id: attorneys.id, name: attorneys.name }).from(attorneys).where(eq(attorneys.organizationId, orgId)).orderBy(asc(attorneys.name));
    const cats = await tx.select({ id: categories.id, key: categories.key, label: categories.label }).from(categories).where(eq(categories.organizationId, orgId)).orderBy(asc(categories.sort));
    const refs = await tx.select({ id: referralSources.id, name: referralSources.name }).from(referralSources).where(eq(referralSources.organizationId, orgId)).orderBy(asc(referralSources.name));
    const catById = new Map(cats.map((c) => [c.id, c]));
    const attById = new Map(atts.map((a) => [a.id, a.name]));
    const refById = new Map(refs.map((r) => [r.id, r.name]));
    const predBy = new Map<string, PredictionFact[]>();
    for (const p of ps) {
      const list = predBy.get(p.matterId) ?? [];
      list.push({
        id: p.id, version: p.version, recordedAt: p.recordedAt.toISOString(), recoveryLow: p.recoveryLow, recoveryHigh: p.recoveryHigh,
        probability: p.probability, expectedDurationMonths: p.expectedDurationMonths, expectedExpense: p.expectedExpense,
        confidence: p.confidence, source: p.source, authorAttorneyId: p.authorAttorneyId, authorLabel: p.authorLabel,
        revisionReason: p.revisionReason, proceduralStage: p.proceduralStage,
      });
      predBy.set(p.matterId, list);
    }
    const outBy = new Map(os.map((o) => [o.matterId, o]));
    const evBy = new Map<string, { type: string; occurredOn: string }[]>();
    for (const e of es) evBy.set(e.matterId, [...(evBy.get(e.matterId) ?? []), { type: e.type, occurredOn: e.occurredOn }]);
    const facts: MatterFact[] = ms.map((m) => {
      const cat = m.categoryId ? catById.get(m.categoryId) : undefined;
      const o = outBy.get(m.id);
      return {
        id: m.id, externalId: m.externalId, name: m.name, status: m.status,
        categoryKey: cat?.key ?? null, categoryLabel: cat?.label ?? null,
        attorneyId: m.leadAttorneyId, attorneyName: m.leadAttorneyId ? attById.get(m.leadAttorneyId) ?? null : null,
        referralId: m.referralSourceId, referralName: m.referralSourceId ? refById.get(m.referralSourceId) ?? null : null,
        jurisdiction: m.jurisdiction, openedOn: m.openedOn, closedOn: m.closedOn, proceduralStage: m.proceduralStage,
        expensesToDate: m.expensesToDate, attorneyHours: m.attorneyHours,
        outcome: o ? {
          resolutionType: o.resolutionType, favorable: o.favorable, resolvedOn: o.resolvedOn, grossRecovery: o.grossRecovery, attorneyFee: o.attorneyFee,
          referralFeePaid: o.referralFeePaid, litigationExpenses: o.litigationExpenses, netToClient: o.netToClient, attorneyHours: o.attorneyHours,
        } : null,
        predictions: predBy.get(m.id) ?? [],
        events: evBy.get(m.id) ?? [],
      };
    });
    const jurisdictions = [...new Set(ms.map((m) => m.jurisdiction).filter((j): j is string => Boolean(j)))].sort();
    return { facts, attorneys: atts, categories: cats, referrals: refs, jurisdictions };
  });
});

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
