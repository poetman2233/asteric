import type { MatterFact } from "./types";
import { evaluationPrediction, type Basis } from "./calibration";
import { histogram, mean, median, monthsBetween } from "./stats";

/* ---------------------------------------------------------------- recovery range */
export const VALUE_BANDS = [
  { key: "lt100", label: "Under $100K", lo: 0, hi: 100_000 },
  { key: "100to250", label: "$100K–$250K", lo: 100_000, hi: 250_000 },
  { key: "250to500", label: "$250K–$500K", lo: 250_000, hi: 500_000 },
  { key: "500to1m", label: "$500K–$1M", lo: 500_000, hi: 1_000_000 },
  { key: "gt1m", label: "$1M and above", lo: 1_000_000, hi: Infinity },
] as const;

export type RangeItem = { matterId: string; low: number; high: number; actual: number; midpoint: number; ratio: number; position: "below" | "within" | "above"; band: string };

/**
 * Recovery-range accuracy. The predicted range is the expected recovery *if the matter
 * resolves favorably*, so it is graded only on favorable resolutions with a recorded gross
 * recovery. (Losses are graded by the probability forecast, not here, to avoid counting
 * the same error twice.)
 */
export function rangeItems(matters: MatterFact[], basis: Basis = "initial"): RangeItem[] {
  const out: RangeItem[] = [];
  for (const m of matters) {
    const p = evaluationPrediction(m, basis);
    const actual = m.outcome?.grossRecovery;
    if (!p || !m.outcome?.favorable || actual == null || actual <= 0) continue;
    const midpoint = (p.recoveryLow + p.recoveryHigh) / 2;
    const position = actual < p.recoveryLow ? "below" : actual > p.recoveryHigh ? "above" : "within";
    const band = VALUE_BANDS.find((b) => midpoint >= b.lo && midpoint < b.hi)?.key ?? "gt1m";
    out.push({ matterId: m.id, low: p.recoveryLow, high: p.recoveryHigh, actual, midpoint, ratio: midpoint > 0 ? actual / midpoint : 0, position, band });
  }
  return out;
}

export function rangeSummary(items: RangeItem[]) {
  const n = items.length;
  const count = (pos: RangeItem["position"]) => items.filter((i) => i.position === pos).length;
  return {
    n,
    within: n ? count("within") / n : null,
    below: n ? count("below") / n : null,
    above: n ? count("above") / n : null,
    medianRatio: median(items.map((i) => i.ratio)),
    matterIds: items.map((i) => i.matterId),
  };
}

export function rangeByBand(items: RangeItem[]) {
  return VALUE_BANDS.map((b) => ({ ...b, ...rangeSummary(items.filter((i) => i.band === b.key)) }));
}

/* ---------------------------------------------------------------- duration */
export type DurationItem = { matterId: string; predicted: number; actual: number; error: number };

/** Duration error in months: actual total duration minus predicted total duration (positive = took longer). */
export function durationItems(matters: MatterFact[], basis: Basis = "initial"): DurationItem[] {
  const out: DurationItem[] = [];
  for (const m of matters) {
    const p = evaluationPrediction(m, basis);
    if (!p || !m.outcome || !m.openedOn || p.expectedDurationMonths == null) continue;
    const actual = monthsBetween(m.openedOn, m.outcome.resolvedOn);
    if (actual < 0) continue;
    out.push({ matterId: m.id, predicted: p.expectedDurationMonths, actual, error: actual - p.expectedDurationMonths });
  }
  return out;
}

export function durationSummary(items: DurationItem[]) {
  const errs = items.map((i) => i.error);
  return {
    n: items.length,
    medianError: median(errs),
    meanError: mean(errs),
    shareLonger: items.length ? items.filter((i) => i.error > 0.5).length / items.length : null,
    shareShorter: items.length ? items.filter((i) => i.error < -0.5).length / items.length : null,
    histogram: histogram(errs, [-24, -12, -6, -3, 0, 3, 6, 12, 24]),
    matterIds: items.map((i) => i.matterId),
  };
}

/* ---------------------------------------------------------------- expense */
export type ExpenseItem = { matterId: string; predicted: number; actual: number; ratio: number };

/** Expense error: actual final litigation expense relative to the predicted expense. */
export function expenseItems(matters: MatterFact[], basis: Basis = "initial"): ExpenseItem[] {
  const out: ExpenseItem[] = [];
  for (const m of matters) {
    const p = evaluationPrediction(m, basis);
    const actual = m.outcome?.litigationExpenses;
    if (!p || actual == null || p.expectedExpense == null || p.expectedExpense <= 0) continue;
    out.push({ matterId: m.id, predicted: p.expectedExpense, actual, ratio: actual / p.expectedExpense });
  }
  return out;
}

export function expenseSummary(items: ExpenseItem[]) {
  const ratios = items.map((i) => i.ratio);
  const med = median(ratios);
  return {
    n: items.length,
    medianRatio: med,
    medianPctError: med == null ? null : med - 1,
    shareOver: items.length ? items.filter((i) => i.ratio > 1.05).length / items.length : null,
    histogram: histogram(ratios.map((r) => (r - 1) * 100), [-100, -50, -25, -10, 0, 10, 25, 50, 100, 200]),
    matterIds: items.map((i) => i.matterId),
  };
}

/* ---------------------------------------------------------------- revisions */
export function revisionSummary(matters: MatterFact[]) {
  let revised = 0, revisions = 0, upProb = 0, downProb = 0;
  const probDeltas: number[] = [];
  for (const m of matters) {
    const ps = m.predictions.filter((p) => p.source !== "sandbox");
    if (ps.length > 1) revised++;
    for (let i = 1; i < ps.length; i++) {
      revisions++;
      const d = ps[i]!.probability - ps[i - 1]!.probability;
      probDeltas.push(d);
      if (d > 0.005) upProb++;
      else if (d < -0.005) downProb++;
    }
  }
  return { mattersWithPredictions: matters.filter((m) => m.predictions.some((p) => p.source !== "sandbox")).length, revised, revisions, upProb, downProb, medianAbsDelta: median(probDeltas.map(Math.abs)) };
}
