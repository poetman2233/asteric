import type { MatterFact } from "./types";
import { evaluationPrediction } from "./calibration";

export type CompletenessRow = { key: string; label: string; numerator: number; denominator: number; pct: number | null; affects: string };

/** Field completeness across the portfolio, and which analytics each gap limits. */
export function dataQuality(ms: MatterFact[]): CompletenessRow[] {
  const closed = ms.filter((m) => m.status === "closed");
  const open = ms.filter((m) => m.status === "open");
  const favorable = closed.filter((m) => m.outcome?.favorable);
  const row = (key: string, label: string, pool: MatterFact[], pred: (m: MatterFact) => boolean, affects: string): CompletenessRow => {
    const numerator = pool.filter(pred).length;
    return { key, label, numerator, denominator: pool.length, pct: pool.length ? numerator / pool.length : null, affects };
  };
  return [
    row("outcome", "Outcome recorded (closed matters)", closed, (m) => Boolean(m.outcome), "Calibration, accuracy and economics"),
    row("gross_recovery", "Gross recovery (favorable outcomes)", favorable, (m) => m.outcome?.grossRecovery != null, "Recovery-range accuracy, economics"),
    row("attorney_fee", "Attorney fee (favorable outcomes)", favorable, (m) => m.outcome?.attorneyFee != null, "Return on legal capital"),
    row("expenses", "Litigation expenses (closed matters)", closed, (m) => (m.outcome?.litigationExpenses ?? m.expensesToDate) != null, "Expense accuracy, return on legal capital"),
    row("hours", "Attorney hours (closed matters)", closed, (m) => (m.outcome?.attorneyHours ?? m.attorneyHours) != null, "Fully costed return on legal capital"),
    row("category", "Matter category", ms, (m) => Boolean(m.categoryKey), "Every category breakdown"),
    row("attorney", "Lead attorney", ms, (m) => Boolean(m.attorneyId), "Attorney comparisons"),
    row("referral", "Referral source", ms, (m) => Boolean(m.referralId), "Referral-source economics"),
    row("opened", "Date opened", ms, (m) => Boolean(m.openedOn), "Duration analytics"),
    row("historical_predictions", "Recorded prediction before resolution (closed)", closed, (m) => Boolean(evaluationPrediction(m, "initial")), "Calibration and accuracy"),
    row("prospective_coverage", "Current prediction (open matters)", open, (m) => m.predictions.some((p) => p.source !== "sandbox"), "Portfolio Watch, future calibration"),
  ];
}

export const MISSING_PREDICATE: Record<string, (m: MatterFact) => boolean> = {
  outcome: (m) => m.status === "closed" && !m.outcome,
  gross_recovery: (m) => Boolean(m.outcome?.favorable) && m.outcome?.grossRecovery == null,
  attorney_fee: (m) => Boolean(m.outcome?.favorable) && m.outcome?.attorneyFee == null,
  expenses: (m) => m.status === "closed" && (m.outcome?.litigationExpenses ?? m.expensesToDate) == null,
  hours: (m) => m.status === "closed" && (m.outcome?.attorneyHours ?? m.attorneyHours) == null,
  category: (m) => !m.categoryKey,
  attorney: (m) => !m.attorneyId,
  referral: (m) => !m.referralId,
  opened: (m) => !m.openedOn,
  historical_predictions: (m) => m.status === "closed" && !evaluationPrediction(m, "initial"),
  prospective_coverage: (m) => m.status === "open" && !m.predictions.some((p) => p.source !== "sandbox"),
};
