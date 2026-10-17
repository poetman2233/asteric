import type { EconomicsAssumptions, MatterFact } from "./types";
import { brierScore, calibration, forecastPairs, MIN_CALIBRATION_N } from "./calibration";
import { durationItems, durationSummary, expenseItems, expenseSummary, rangeByBand, rangeItems } from "./accuracy";
import { aggregateEconomics, economicsBy, MIN_GROUP_RESOLVED } from "./economics";
import { median } from "./stats";
import { portfolioWatch } from "./watch";

export type Insight = {
  id: string;
  kind: "Valuation" | "Calibration" | "Duration" | "Expense" | "Referral economics" | "Attorney" | "Coverage" | "Portfolio watch";
  headline: string;
  detail: string;
  n: number;
  period: string | null;
  href: string;
  methodology: string;
  /** Larger = more material; used for ordering only. */
  weight: number;
  causalNote: boolean;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const money = (x: number) => (x >= 1_000_000 ? `$${(x / 1_000_000).toFixed(2)}M` : `$${Math.round(x / 1000)}K`);
const mult = (x: number) => `${x.toFixed(2)}×`;

function period(ms: MatterFact[]): string | null {
  const ds = ms.map((m) => m.outcome?.resolvedOn).filter(Boolean).sort() as string[];
  if (!ds.length) return null;
  const a = ds[0]!.slice(0, 4), b = ds[ds.length - 1]!.slice(0, 4);
  return a === b ? `Resolved ${a}` : `Resolved ${a}–${b}`;
}

/**
 * Deterministic insights. Every rule has a minimum sample and a supporting-matters link
 * built from the same filters the matters list applies.
 */
export function generateInsights(all: MatterFact[], a: EconomicsAssumptions, opts: { asOf: string; staleDays: number; expenseThreshold: number }): Insight[] {
  const out: Insight[] = [];
  const resolved = all.filter((m) => m.outcome);
  const byId = new Map(all.map((m) => [m.id, m]));
  const subset = (ids: string[]) => ids.map((id) => byId.get(id)!).filter(Boolean);

  /* 1. Valuation by predicted value band */
  const bands = rangeByBand(rangeItems(resolved)).filter((b) => b.n >= 12);
  if (bands.length >= 2) {
    const worst = [...bands].sort((x, y) => (x.medianRatio ?? 1) - (y.medianRatio ?? 1))[0]!;
    const best = [...bands].sort((x, y) => (y.within ?? 0) - (x.within ?? 0))[0]!;
    if (worst.medianRatio != null && worst.medianRatio < 0.8 && worst.key !== best.key) {
      out.push({
        id: `valuation-${worst.key}`, kind: "Valuation",
        headline: `Matters predicted at ${worst.label.replace("and above", "or more")} have been systematically overestimated.`,
        detail: `The median recovery was ${pct(worst.medianRatio)} of the predicted midpoint, and ${pct(worst.within ?? 0)} of recoveries landed inside the predicted range, compared with ${pct(best.within ?? 0)} for matters predicted at ${best.label}.`,
        n: worst.n, period: period(subset(worst.matterIds)), href: `/app/matters?status=closed&band=${worst.key}`, methodology: "range", weight: (1 - worst.medianRatio) * Math.sqrt(worst.n), causalNote: false,
      });
    }
  }

  /* 2. Calibration: the most material probability band gap */
  const pairs = forecastPairs(resolved, "initial");
  if (pairs.length >= MIN_CALIBRATION_N) {
    const cal = calibration(pairs);
    const candidates = cal.bins.filter((b) => b.n >= 15 && b.meanPredicted != null && b.observed != null && Math.abs(b.observed - b.meanPredicted) >= 0.1);
    const top = candidates.sort((x, y) => Math.abs(y.observed! - y.meanPredicted!) * Math.sqrt(y.n) - Math.abs(x.observed! - x.meanPredicted!) * Math.sqrt(x.n))[0];
    if (top) {
      const over = top.observed! < top.meanPredicted!;
      out.push({
        id: `calibration-${top.lo}`, kind: "Calibration",
        headline: `Predictions between ${pct(top.lo)} and ${pct(top.hi)} favorable resolved favorably ${pct(top.observed!)} of the time.`,
        detail: `Initial predictions in this band averaged ${pct(top.meanPredicted!)}, so the firm was ${over ? "overconfident" : "underconfident"} by ${Math.round(Math.abs(top.observed! - top.meanPredicted!) * 100)} percentage points. Firm-wide Brier score: ${cal.brier!.toFixed(3)} across ${cal.n} resolved predictions.`,
        n: top.n, period: period(subset(top.matterIds)), href: `/app/matters?status=closed&pbin=${top.lo.toFixed(1)}-${top.hi.toFixed(1)}`, methodology: "calibration", weight: Math.abs(top.observed! - top.meanPredicted!) * Math.sqrt(top.n) * 2, causalNote: false,
      });
    }
  }

  /* 3 & 4. Category duration and expense overruns */
  const cats = new Map<string, { label: string; ms: MatterFact[] }>();
  for (const m of resolved) {
    if (!m.categoryKey) continue;
    const g = cats.get(m.categoryKey) ?? { label: m.categoryLabel ?? m.categoryKey, ms: [] };
    g.ms.push(m);
    cats.set(m.categoryKey, g);
  }
  const firmDur = durationSummary(durationItems(resolved)).medianError;
  const durCands = [...cats.entries()].map(([k, g]) => ({ k, g, s: durationSummary(durationItems(g.ms)) })).filter((x) => x.s.n >= 15 && (x.s.medianError ?? 0) >= 2);
  const durTop = durCands.sort((x, y) => (y.s.medianError ?? 0) - (x.s.medianError ?? 0))[0];
  if (durTop) {
    out.push({
      id: `duration-${durTop.k}`, kind: "Duration",
      headline: `${durTop.g.label} matters have taken a median ${durTop.s.medianError!.toFixed(1)} months longer than initially forecast.`,
      detail: `${pct(durTop.s.shareLonger ?? 0)} of these matters ran longer than their initial expected duration. Firm-wide, the median matter ran ${(firmDur ?? 0).toFixed(1)} months ${(firmDur ?? 0) >= 0 ? "longer" : "shorter"} than forecast.`,
      n: durTop.s.n, period: period(durTop.g.ms), href: `/app/matters?status=closed&category=${durTop.k}`, methodology: "duration", weight: durTop.s.medianError! * Math.sqrt(durTop.s.n) / 2, causalNote: false,
    });
  }
  const expCands = [...cats.entries()].map(([k, g]) => ({ k, g, s: expenseSummary(expenseItems(g.ms)) })).filter((x) => x.s.n >= 15 && (x.s.medianPctError ?? 0) >= 0.2);
  const expTop = expCands.sort((x, y) => (y.s.medianPctError ?? 0) - (x.s.medianPctError ?? 0))[0];
  if (expTop) {
    out.push({
      id: `expense-${expTop.k}`, kind: "Expense",
      headline: `${expTop.g.label} matters exceeded predicted litigation expense by a median ${pct(expTop.s.medianPctError!)}.`,
      detail: `${pct(expTop.s.shareOver ?? 0)} of resolved ${expTop.g.label.toLowerCase()} matters with a recorded prediction finished above their expected expense.`,
      n: expTop.s.n, period: period(expTop.g.ms), href: `/app/matters?status=closed&category=${expTop.k}`, methodology: "expense", weight: expTop.s.medianPctError! * Math.sqrt(expTop.s.n), causalNote: false,
    });
  }

  /* 5. Referral sources: large recoveries, weak return on capital */
  const portfolio = aggregateEconomics("all", "All", resolved, a);
  const refs = economicsBy(all.filter((m) => m.referralId), "referral", a).filter((g) => g.resolved >= MIN_GROUP_RESOLVED && g.rolcExpense != null && g.medianRecovery != null);
  if (refs.length >= 3 && portfolio.rolcExpense) {
    const byRecovery = [...refs].sort((x, y) => y.medianRecovery! - x.medianRecovery!);
    const byRolc = [...refs].sort((x, y) => x.rolcExpense! - y.rolcExpense!);
    const lowest = byRolc[0]!;
    const recRank = byRecovery.findIndex((g) => g.key === lowest.key);
    if (recRank <= 1 && lowest.rolcExpense! < portfolio.rolcExpense * 0.75) {
      out.push({
        id: `referral-${lowest.key}`, kind: "Referral economics",
        headline: `${lowest.label} has the ${recRank === 0 ? "highest" : "second-highest"} median recovery but the lowest return on legal capital.`,
        detail: `Matters attributed to this source produced a median recovery of ${money(lowest.medianRecovery!)} and ${mult(lowest.rolcExpense!)} ROLC, against ${mult(portfolio.rolcExpense)} for the portfolio, among sources with at least ${MIN_GROUP_RESOLVED} resolved matters. Median duration ${(lowest.medianDuration ?? 0).toFixed(1)} months; median expense ${money(lowest.medianExpense ?? 0)}.`,
        n: lowest.resolved, period: period(subset(lowest.matterIds)), href: `/app/matters?status=closed&referral=${lowest.key}`, methodology: "rolc", weight: (1 - lowest.rolcExpense! / portfolio.rolcExpense) * Math.sqrt(lowest.resolved) * 1.6, causalNote: true,
      });
    }
  }

  /* 6. Attorney: well calibrated on probability, but duration/expense bias */
  const firmBrier = brierScore(pairs);
  const atts = new Map<string, { name: string; ms: MatterFact[] }>();
  for (const m of resolved) {
    if (!m.attorneyId) continue;
    const g = atts.get(m.attorneyId) ?? { name: m.attorneyName ?? "Unknown", ms: [] };
    g.ms.push(m);
    atts.set(m.attorneyId, g);
  }
  if (firmBrier != null) {
    let best: Insight | null = null;
    for (const [id, g] of atts) {
      const ps = forecastPairs(g.ms, "initial");
      if (ps.length < 20) continue;
      const b = brierScore(ps)!;
      const d = durationSummary(durationItems(g.ms));
      const e = expenseSummary(expenseItems(g.ms));
      if (b <= firmBrier && (d.medianError ?? 0) >= 3) {
        const expPart = (e.medianPctError ?? 0) >= 0.2 ? `, and recorded expense forecasts that were exceeded by a median ${pct(e.medianPctError!)}` : "";
        const cand: Insight = {
          id: `attorney-${id}`, kind: "Attorney",
          headline: `${g.name} is well calibrated on outcome probability but underestimates duration by a median ${d.medianError!.toFixed(1)} months.`,
          detail: `Brier score ${b.toFixed(3)} against ${firmBrier.toFixed(3)} firm-wide across ${ps.length} resolved predictions${expPart}.`,
          n: ps.length, period: period(g.ms), href: `/app/matters?status=closed&attorney=${id}`, methodology: "brier", weight: d.medianError! * Math.sqrt(ps.length) / 3, causalNote: true,
        };
        if (!best || cand.weight > best.weight) best = cand;
      }
    }
    if (best) out.push(best);
  }

  /* 7. Coverage and 8. Portfolio watch (operational) */
  const open = all.filter((m) => m.status === "open");
  const uncovered = open.filter((m) => !m.predictions.some((p) => p.source !== "sandbox"));
  if (open.length >= 10 && uncovered.length / open.length > 0.15) {
    out.push({
      id: "coverage", kind: "Coverage",
      headline: `${uncovered.length} of ${open.length} open matters have no recorded prediction.`,
      detail: `Prospective prediction coverage is ${pct(1 - uncovered.length / open.length)}. Calibration for future outcomes depends on predictions recorded before results are known.`,
      n: open.length, period: null, href: "/app/watch?kind=no_prediction", methodology: "coverage", weight: (uncovered.length / open.length) * 3, causalNote: false,
    });
  }
  const watch = portfolioWatch(all, opts).filter((f) => f.kind === "expense_variance");
  if (watch.length >= 3) {
    const med = median(watch.map((w) => w.sortValue)) ?? 0;
    out.push({
      id: "watch-expense", kind: "Portfolio watch",
      headline: `${watch.length} open matters exceed their latest expense forecast by more than ${pct(opts.expenseThreshold)}.`,
      detail: `The median overrun among these matters is ${pct(med)}. These are flagged for review of the original underwriting assumptions.`,
      n: watch.length, period: null, href: "/app/watch?kind=expense_variance", methodology: "watch", weight: Math.sqrt(watch.length) * 0.9, causalNote: false,
    });
  }

  return out.sort((x, y) => y.weight - x.weight);
}
