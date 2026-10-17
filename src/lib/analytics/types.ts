/**
 * Plain data shapes the analytics engine operates on. The server loads these from
 * Postgres (src/server/services/portfolio.ts); tests construct them directly.
 */
export type PredictionFact = {
  id: string;
  version: number;
  recordedAt: string; // ISO timestamp
  recoveryLow: number;
  recoveryHigh: number;
  probability: number; // 0–1
  expectedDurationMonths: number | null; // total, from matter opening to resolution
  expectedExpense: number | null; // total litigation expense expected
  confidence: "low" | "medium" | "high" | null;
  source: "prospective" | "historical" | "sandbox";
  authorAttorneyId: string | null;
  authorLabel: string;
  revisionReason?: string | null;
  proceduralStage?: string | null;
};

export type OutcomeFact = {
  resolutionType: string;
  favorable: boolean;
  resolvedOn: string; // YYYY-MM-DD
  grossRecovery: number | null;
  attorneyFee: number | null;
  referralFeePaid: number | null;
  litigationExpenses: number | null;
  netToClient: number | null;
  attorneyHours: number | null;
};

export type MatterFact = {
  id: string;
  externalId: string | null;
  name: string;
  status: "open" | "closed";
  categoryKey: string | null;
  categoryLabel: string | null;
  attorneyId: string | null;
  attorneyName: string | null;
  referralId: string | null;
  referralName: string | null;
  jurisdiction: string | null;
  openedOn: string | null;
  closedOn: string | null;
  proceduralStage: string | null;
  expensesToDate: number | null;
  attorneyHours: number | null;
  outcome: OutcomeFact | null;
  /** Ascending by version. Sandbox (demo) predictions are included; analytics exclude them where noted. */
  predictions: PredictionFact[];
  events: { type: string; occurredOn: string }[];
};

export type EconomicsAssumptions = {
  attorneyHourlyCost: number | null;
  defaultContingencyRate: number | null;
  expensesReimbursedFromRecovery: boolean;
};
