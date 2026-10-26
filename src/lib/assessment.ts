/**
 * Quick assessment: turns a few comparative answers from the attorney into the
 * structured assessment Asteric stores. Nothing here estimates a matter on the
 * attorney's behalf. Every number shown is either the attorney's choice or the
 * firm's own historical typical value, offered for confirmation.
 */
import type { MatterFact } from "./analytics/types";
import { median, monthsBetween, quantile } from "./analytics/stats";

export const STRENGTH = [
  { key: "much_weaker", label: "Much weaker" },
  { key: "weaker", label: "Somewhat weaker" },
  { key: "typical", label: "About typical" },
  { key: "stronger", label: "Somewhat stronger" },
  { key: "much_stronger", label: "Much stronger" },
] as const;
export type Strength = (typeof STRENGTH)[number]["key"];

/** Broad likelihood anchors and the numbers each offers for confirmation. */
export const LIKELIHOOD = [
  { key: "low", label: "Low", options: [15, 20, 25, 30] },
  { key: "below_even", label: "Below even", options: [35, 40, 45] },
  { key: "even", label: "About even", options: [45, 50, 55] },
  { key: "likely", label: "More likely than not", options: [60, 65, 70, 75] },
  { key: "high", label: "High", options: [80, 85, 90] },
] as const;
export type Likelihood = (typeof LIKELIHOOD)[number]["key"];

export const RELATIVE = {
  duration: [{ key: "shorter", label: "Shorter", factor: 0.75 }, { key: "typical", label: "About typical", factor: 1 }, { key: "longer", label: "Longer", factor: 1.3 }],
  expense: [{ key: "lower", label: "Lower than typical", factor: 0.75 }, { key: "typical", label: "About typical", factor: 1 }, { key: "higher", label: "Higher than typical", factor: 1.35 }],
} as const;

export type Baseline = {
  categoryKey: string | null;
  categoryLabel: string;
  /** Resolved matters the typical values come from; 0 means no firm history yet. */
  n: number;
  durationMonths: number;
  expense: number;
  /** Five recovery ranges sized from the firm's own favorable recoveries, low to high. */
  bands: { low: number; high: number }[];
  fromCategory: boolean;
};

const nice = (x: number) => {
  const step = x >= 1_000_000 ? 100_000 : x >= 500_000 ? 50_000 : x >= 100_000 ? 25_000 : 5_000;
  return Math.max(step, Math.round(x / step) * step);
};
const DEFAULT_BANDS = [[25_000, 75_000], [75_000, 150_000], [150_000, 300_000], [300_000, 600_000], [600_000, 1_200_000]];

function buildBaseline(ms: MatterFact[], key: string | null, label: string, fromCategory: boolean): Baseline {
  const resolved = ms.filter((m) => m.outcome && m.openedOn);
  const durations = resolved.map((m) => monthsBetween(m.openedOn!, m.outcome!.resolvedOn)).filter((d) => d > 0);
  const expenses = resolved.map((m) => m.outcome!.litigationExpenses ?? m.expensesToDate).filter((x): x is number => x != null && x > 0);
  const recoveries = resolved.filter((m) => m.outcome!.favorable && (m.outcome!.grossRecovery ?? 0) > 0).map((m) => m.outcome!.grossRecovery!);
  let bands = DEFAULT_BANDS.map(([low, high]) => ({ low: low!, high: high! }));
  if (recoveries.length >= 8) {
    const q = (p: number) => nice(quantile(recoveries, p)!);
    const edges = [q(0.1), q(0.3), q(0.5), q(0.7), q(0.9), nice(quantile(recoveries, 0.9)! * 1.6)];
    for (let i = 1; i < edges.length; i++) if (edges[i]! <= edges[i - 1]!) edges[i] = nice(edges[i - 1]! * 1.3);
    bands = edges.slice(0, 5).map((low, i) => ({ low, high: edges[i + 1]! }));
  }
  return {
    categoryKey: key, categoryLabel: label, n: resolved.length, fromCategory,
    durationMonths: durations.length >= 5 ? Math.round(median(durations)!) : 18,
    expense: expenses.length >= 5 ? nice(median(expenses)!) : 40_000,
    bands,
  };
}

/** The firm's typical values for matters like this one: same category when there is enough history, otherwise all matters. */
export function baselineFor(facts: MatterFact[], categoryKey: string | null, categoryLabel: string | null): Baseline {
  const cat = categoryKey ? facts.filter((m) => m.categoryKey === categoryKey) : [];
  if (cat.filter((m) => m.outcome).length >= 12) return buildBaseline(cat, categoryKey, categoryLabel ?? "this category", true);
  return buildBaseline(facts, null, "all matters", false);
}

export const STRENGTH_TO_BAND: Record<Strength, number> = { much_weaker: 0, weaker: 1, typical: 2, stronger: 3, much_stronger: 4 };
export const STRENGTH_TO_LIKELIHOOD: Record<Strength, Likelihood> = { much_weaker: "low", weaker: "below_even", typical: "even", stronger: "likely", much_stronger: "high" };

export function roundDuration(m: number) { return Math.max(1, Math.round(m)); }
export function roundExpense(x: number) { return x >= 100_000 ? Math.round(x / 5_000) * 5_000 : Math.round(x / 2_500) * 2_500; }

export type AssessmentInputs = {
  mode: "quick" | "update" | "detailed" | "reaffirm";
  strength?: Strength;
  likelihood?: Likelihood;
  recoveryBand?: number | "custom" | "same" | string;
  durationRel?: string;
  expenseRel?: string;
  direction?: "improved" | "worsened";
  baselineN?: number;
  baselineScope?: string;
};

export type StructuredAssessment = {
  recoveryLow: number; recoveryHigh: number; probability: number;
  expectedDurationMonths: number; expectedExpense: number;
  confidence: "low" | "medium" | "high"; drivers: string[];
};

/** Scales a prior range for an "improved" or "worsened" update, in steps the attorney chooses. */
export function scaleRange(low: number, high: number, factor: number) {
  return { low: nice(low * factor), high: nice(high * factor) };
}
