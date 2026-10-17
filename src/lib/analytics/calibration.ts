import type { MatterFact, PredictionFact } from "./types";
import { mean, wilson } from "./stats";

/** Minimum resolved predictions before a calibration curve or Brier score is shown. */
export const MIN_CALIBRATION_N = 30;
/** Bins with fewer observations are drawn as context only, not as evidence. */
export const MIN_BIN_N = 5;

export type Basis = "initial" | "latest";

/**
 * The prediction a resolved matter is graded on.
 *  initial — the first prediction recorded (the underwriting view).
 *  latest  — the last prediction recorded on or before resolution.
 * Demo sandbox predictions are never graded.
 */
export function evaluationPrediction(m: MatterFact, basis: Basis, includeHistorical = true): PredictionFact | null {
  if (!m.outcome) return null;
  const cutoff = m.outcome.resolvedOn;
  const eligible = m.predictions.filter(
    (p) => p.source !== "sandbox" && (includeHistorical || p.source === "prospective") && p.recordedAt.slice(0, 10) <= cutoff,
  );
  if (!eligible.length) return null;
  return basis === "initial" ? eligible[0]! : eligible[eligible.length - 1]!;
}

export type ForecastPair = { matterId: string; p: number; o: 0 | 1; attorneyId: string | null; attorneyName: string };

export function forecastPairs(matters: MatterFact[], basis: Basis = "initial", includeHistorical = true): ForecastPair[] {
  const out: ForecastPair[] = [];
  for (const m of matters) {
    const pred = evaluationPrediction(m, basis, includeHistorical);
    if (!pred || !m.outcome) continue;
    out.push({
      matterId: m.id,
      p: pred.probability,
      o: m.outcome.favorable ? 1 : 0,
      attorneyId: pred.authorAttorneyId ?? m.attorneyId,
      attorneyName: pred.authorAttorneyId ? pred.authorLabel : m.attorneyName ?? pred.authorLabel,
    });
  }
  return out;
}

/** Brier score: mean squared error of probability forecasts against binary outcomes. 0 is perfect; lower is better. */
export function brierScore(pairs: { p: number; o: 0 | 1 }[]): number | null {
  if (!pairs.length) return null;
  return mean(pairs.map(({ p, o }) => (p - o) ** 2));
}

export type CalibrationBin = {
  lo: number; hi: number; n: number;
  meanPredicted: number | null;
  observed: number | null;
  ci: { lo: number; hi: number } | null;
  sufficient: boolean;
  matterIds: string[];
};

export type CalibrationResult = {
  n: number;
  brier: number | null;
  baseRate: number | null;
  /** Brier score of always forecasting the observed base rate. */
  referenceBrier: number | null;
  /** 1 − brier / referenceBrier. Positive means more informative than the base rate alone. */
  skill: number | null;
  bins: CalibrationBin[];
  sufficient: boolean;
};

export function calibration(pairs: ForecastPair[], binCount = 10): CalibrationResult {
  const n = pairs.length;
  const brier = brierScore(pairs);
  const baseRate = n ? pairs.filter((x) => x.o === 1).length / n : null;
  const referenceBrier = baseRate == null ? null : baseRate * (1 - baseRate);
  const skill = brier != null && referenceBrier ? 1 - brier / referenceBrier : null;
  const bins: CalibrationBin[] = Array.from({ length: binCount }, (_, i) => ({
    lo: i / binCount, hi: (i + 1) / binCount, n: 0, meanPredicted: null, observed: null, ci: null, sufficient: false, matterIds: [],
  }));
  const ps: number[][] = bins.map(() => []);
  const os: number[][] = bins.map(() => []);
  for (const pr of pairs) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor(pr.p * binCount)));
    ps[idx]!.push(pr.p);
    os[idx]!.push(pr.o);
    bins[idx]!.matterIds.push(pr.matterId);
  }
  bins.forEach((b, i) => {
    b.n = ps[i]!.length;
    if (!b.n) return;
    const k = os[i]!.reduce((a, c) => a + c, 0);
    b.meanPredicted = mean(ps[i]!);
    b.observed = k / b.n;
    b.ci = wilson(k, b.n);
    b.sufficient = b.n >= MIN_BIN_N;
  });
  return { n, brier, baseRate, referenceBrier, skill, bins, sufficient: n >= MIN_CALIBRATION_N };
}

/** Observed favorable rate for predictions inside [lo, hi). */
export function bandOutcome(pairs: ForecastPair[], lo: number, hi: number) {
  const inBand = pairs.filter((x) => x.p >= lo && (x.p < hi || (hi >= 1 && x.p <= 1)));
  const k = inBand.filter((x) => x.o === 1).length;
  return { n: inBand.length, observed: inBand.length ? k / inBand.length : null, meanPredicted: mean(inBand.map((x) => x.p)), matterIds: inBand.map((x) => x.matterId) };
}
