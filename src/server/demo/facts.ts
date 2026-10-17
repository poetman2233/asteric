import type { MatterFact } from "@/lib/analytics/types";
import { DEFAULT_CATEGORIES } from "@/lib/taxonomy";
import { ATTORNEYS, SOURCES, type DemoMatter } from "./generate";

/** Converts generated demo matters to analytics facts without a database (used by tests and tuning). */
export function demoToFacts(ms: DemoMatter[]): MatterFact[] {
  const cat = new Map(DEFAULT_CATEGORIES.employment.map((c) => [c.key, c.label]));
  return ms.map((m, i) => ({
    id: `m${i}`, externalId: m.externalId, name: m.name, status: m.status,
    categoryKey: m.category, categoryLabel: cat.get(m.category) ?? m.category,
    attorneyId: m.attorney, attorneyName: ATTORNEYS.find((a) => a.key === m.attorney)!.name,
    referralId: m.source, referralName: m.source ? SOURCES.find((s) => s.key === m.source)!.name : null,
    jurisdiction: m.jurisdiction, openedOn: m.openedOn, closedOn: m.outcome?.resolvedOn ?? null, proceduralStage: m.stage,
    expensesToDate: m.expensesToDate, attorneyHours: m.hours,
    outcome: m.outcome ? {
      resolutionType: m.outcome.resolutionType, favorable: m.outcome.favorable, resolvedOn: m.outcome.resolvedOn,
      grossRecovery: m.outcome.gross, attorneyFee: m.outcome.fee, referralFeePaid: m.outcome.referralFee,
      litigationExpenses: m.outcome.expenses, netToClient: m.outcome.netToClient, attorneyHours: m.outcome.hours,
    } : null,
    predictions: m.predictions.map((p) => ({
      id: `m${i}p${p.version}`, version: p.version, recordedAt: `${p.recordedOn}T17:00:00.000Z`, recoveryLow: p.low, recoveryHigh: p.high,
      probability: p.probability, expectedDurationMonths: p.durationMonths, expectedExpense: p.expense, confidence: p.confidence,
      source: p.source, authorAttorneyId: m.attorney, authorLabel: ATTORNEYS.find((a) => a.key === m.attorney)!.name,
      revisionReason: p.reason, proceduralStage: p.stage,
    })),
    events: m.events.map((e) => ({ type: e.type, occurredOn: e.on })),
  }));
}
