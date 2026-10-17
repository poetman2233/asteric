import { describe, expect, it } from "vitest";
import type { MatterFact, PredictionFact } from "@/lib/analytics/types";
import { median, quantile, wilson, monthsBetween, histogram } from "@/lib/analytics/stats";
import { brierScore, calibration, evaluationPrediction, forecastPairs } from "@/lib/analytics/calibration";
import { durationItems, durationSummary, expenseItems, expenseSummary, rangeItems, rangeSummary } from "@/lib/analytics/accuracy";
import { aggregateEconomics, matterEconomics } from "@/lib/analytics/economics";
import { portfolioWatch } from "@/lib/analytics/watch";
import { applyFilter, parseFilter } from "@/lib/analytics/filters";
import { dataQuality } from "@/lib/analytics/quality";

let seq = 0;
function pred(over: Partial<PredictionFact> = {}): PredictionFact {
  seq++;
  return {
    id: `p${seq}`, version: 1, recordedAt: "2022-01-10T12:00:00Z", recoveryLow: 200_000, recoveryHigh: 300_000, probability: 0.6,
    expectedDurationMonths: 12, expectedExpense: 40_000, confidence: "medium", source: "prospective", authorAttorneyId: "a1", authorLabel: "J. Ross", ...over,
  };
}
function matter(over: Partial<MatterFact> = {}): MatterFact {
  seq++;
  return {
    id: `m${seq}`, externalId: null, name: `Matter ${seq}`, status: "closed", categoryKey: "retaliation", categoryLabel: "Retaliation",
    attorneyId: "a1", attorneyName: "J. Ross", referralId: "r1", referralName: "Source A", jurisdiction: "CA", openedOn: "2022-01-01",
    closedOn: "2023-01-01", proceduralStage: null, expensesToDate: null, attorneyHours: null, outcome: null, predictions: [], events: [], ...over,
  };
}
const outcome = (over: Partial<NonNullable<MatterFact["outcome"]>> = {}) => ({
  resolutionType: "settlement", favorable: true, resolvedOn: "2023-01-01", grossRecovery: 250_000, attorneyFee: 100_000,
  referralFeePaid: null, litigationExpenses: 40_000, netToClient: 110_000, attorneyHours: null, ...over,
});

describe("statistics", () => {
  it("computes medians and quantiles with linear interpolation", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it("computes the Wilson interval (8 of 10)", () => {
    const ci = wilson(8, 10)!;
    expect(ci.lo).toBeCloseTo(0.4902, 3);
    expect(ci.hi).toBeCloseTo(0.9433, 3);
  });
  it("measures months between dates", () => {
    expect(monthsBetween("2022-01-01", "2023-01-01")).toBeCloseTo(365 / 30.4375, 6);
  });
  it("bins values into a histogram including edges", () => {
    expect(histogram([-1, 0, 2, 5], [0, 3, 6]).map((b) => b.count)).toEqual([3, 1]);
  });
});

describe("Brier score and calibration", () => {
  it("matches a hand-computed Brier score", () => {
    const pairs = [{ p: 0.9, o: 1 as const }, { p: 0.2, o: 0 as const }, { p: 0.7, o: 0 as const }, { p: 0.5, o: 1 as const }];
    // (0.01 + 0.04 + 0.49 + 0.25) / 4 = 0.1975
    expect(brierScore(pairs)).toBeCloseTo(0.1975, 10);
  });
  it("scores perfect and worst-case forecasts", () => {
    expect(brierScore([{ p: 1, o: 1 }, { p: 0, o: 0 }])).toBe(0);
    expect(brierScore([{ p: 1, o: 0 }, { p: 0, o: 1 }])).toBe(1);
    expect(brierScore([{ p: 0.5, o: 1 }, { p: 0.5, o: 0 }])).toBe(0.25);
  });
  it("bins predictions and reports observed frequency, base rate and skill", () => {
    const pairs = [0.85, 0.85, 0.85, 0.85].map((p, i) => ({ matterId: `x${i}`, p, o: (i < 3 ? 1 : 0) as 0 | 1, attorneyId: null, attorneyName: "" }));
    const cal = calibration(pairs);
    const bin = cal.bins[8]!;
    expect(bin.n).toBe(4);
    expect(bin.meanPredicted).toBeCloseTo(0.85);
    expect(bin.observed).toBe(0.75);
    expect(cal.baseRate).toBe(0.75);
    // Brier = (3×0.0225 + 0.7225)/4 = 0.19750; reference = 0.75×0.25 = 0.1875; skill = 1 − 0.1975/0.1875
    expect(cal.brier).toBeCloseTo(0.1975, 10);
    expect(cal.skill).toBeCloseTo(1 - 0.1975 / 0.1875, 10);
    expect(cal.sufficient).toBe(false);
  });
  it("puts p = 1.0 in the top bin", () => {
    const cal = calibration([{ matterId: "a", p: 1, o: 1, attorneyId: null, attorneyName: "" }]);
    expect(cal.bins[9]!.n).toBe(1);
  });
  it("grades the initial prediction by default, ignoring sandbox and post-resolution predictions", () => {
    const m = matter({
      outcome: outcome({ resolvedOn: "2023-01-01" }),
      predictions: [
        pred({ version: 1, probability: 0.6, recordedAt: "2022-01-05T00:00:00Z" }),
        pred({ version: 2, probability: 0.8, recordedAt: "2022-06-01T00:00:00Z" }),
        pred({ version: 3, probability: 0.95, recordedAt: "2023-02-01T00:00:00Z" }),
        pred({ version: 4, probability: 0.1, recordedAt: "2022-07-01T00:00:00Z", source: "sandbox" }),
      ],
    });
    expect(evaluationPrediction(m, "initial")!.probability).toBe(0.6);
    expect(evaluationPrediction(m, "latest")!.probability).toBe(0.8);
    expect(forecastPairs([m])).toHaveLength(1);
    expect(evaluationPrediction(matter(), "initial")).toBeNull();
  });
});

describe("accuracy", () => {
  it("grades recovery ranges only on favorable resolutions", () => {
    const within = matter({ outcome: outcome({ grossRecovery: 250_000 }), predictions: [pred()] });
    const below = matter({ outcome: outcome({ grossRecovery: 150_000 }), predictions: [pred()] });
    const above = matter({ outcome: outcome({ grossRecovery: 400_000 }), predictions: [pred()] });
    const lost = matter({ outcome: outcome({ favorable: false, grossRecovery: 0, resolutionType: "dismissal" }), predictions: [pred()] });
    const items = rangeItems([within, below, above, lost]);
    expect(items.map((i) => i.position)).toEqual(["within", "below", "above"]);
    const s = rangeSummary(items);
    expect(s.within).toBeCloseTo(1 / 3);
    expect(s.medianRatio).toBeCloseTo(250_000 / 250_000);
    expect(items[0]!.band).toBe("250to500");
  });
  it("computes duration error as actual minus predicted months", () => {
    const m = matter({ openedOn: "2022-01-01", outcome: outcome({ resolvedOn: "2023-07-02" }), predictions: [pred({ expectedDurationMonths: 12 })] });
    const [d] = durationItems([m]);
    expect(d!.actual).toBeCloseTo(547 / 30.4375, 6);
    expect(d!.error).toBeCloseTo(547 / 30.4375 - 12, 6);
    expect(durationSummary([d!]).shareLonger).toBe(1);
  });
  it("computes expense ratios", () => {
    const m1 = matter({ outcome: outcome({ litigationExpenses: 60_000 }), predictions: [pred({ expectedExpense: 40_000 })] });
    const m2 = matter({ outcome: outcome({ litigationExpenses: 30_000 }), predictions: [pred({ expectedExpense: 40_000 })] });
    const s = expenseSummary(expenseItems([m1, m2]));
    expect(s.medianRatio).toBeCloseTo((1.5 + 0.75) / 2);
    expect(s.medianPctError).toBeCloseTo(0.125);
  });
});

describe("return on legal capital", () => {
  const a = { attorneyHourlyCost: 250, defaultContingencyRate: null, expensesReimbursedFromRecovery: true };
  it("computes expense-only and fully costed ROLC for a favorable matter", () => {
    const m = matter({ outcome: outcome({ grossRecovery: 300_000, attorneyFee: 100_000, referralFeePaid: 20_000, litigationExpenses: 25_000, attorneyHours: 200 }) });
    const e = matterEconomics(m, a);
    expect(e.included).toBe(true);
    expect(e.netFee).toBe(80_000);
    expect(e.reimbursed).toBe(25_000);
    expect(e.return).toBe(105_000);
    expect(e.rolcExpense).toBeCloseTo(4.2);
    expect(e.capitalFull).toBe(75_000);
    expect(e.rolcFull).toBeCloseTo(1.4);
  });
  it("treats a loss as zero return and aggregates as Σ return ÷ Σ capital", () => {
    const win = matter({ outcome: outcome({ grossRecovery: 300_000, attorneyFee: 100_000, referralFeePaid: 20_000, litigationExpenses: 25_000 }) });
    const loss = matter({ outcome: outcome({ favorable: false, resolutionType: "dismissal", grossRecovery: 0, attorneyFee: null, litigationExpenses: 10_000 }) });
    expect(matterEconomics(loss, a).rolcExpense).toBe(0);
    const g = aggregateEconomics("x", "X", [win, loss], a);
    expect(g.rolcExpense).toBeCloseTo(105_000 / 35_000);
    expect(g.favorableRate).toBe(0.5);
    expect(g.rolcFull).toBeNull(); // no hours recorded
  });
  it("excludes matters missing a fee unless a default contingency rate is configured", () => {
    const m = matter({ outcome: outcome({ attorneyFee: null, grossRecovery: 90_000, litigationExpenses: 9_000 }) });
    expect(matterEconomics(m, a).exclusionReason).toBe("missing_fee");
    const derived = matterEconomics(m, { ...a, defaultContingencyRate: 1 / 3 });
    expect(derived.feeDerived).toBe(true);
    expect(derived.netFee).toBeCloseTo(30_000);
    expect(derived.rolcExpense).toBeCloseTo((30_000 + 9_000) / 9_000);
  });
});

describe("portfolio watch", () => {
  const opts = { asOf: "2024-06-01", staleDays: 180, expenseThreshold: 0.25 };
  it("flags expense variance, exceeded duration, unrevised events and stale predictions", () => {
    const m = matter({
      status: "open", outcome: null, openedOn: "2022-06-01", expensesToDate: 81_200,
      predictions: [pred({ recordedAt: "2023-11-01T00:00:00Z", expectedExpense: 55_000, expectedDurationMonths: 18 })],
      events: [{ type: "mediation_held", occurredOn: "2024-02-01" }],
    });
    const kinds = portfolioWatch([m], opts).map((f) => f.kind).sort();
    expect(kinds).toEqual(["duration_exceeded", "expense_variance", "stale_prediction", "unrevised_major_event"].sort());
    const ev = portfolioWatch([m], opts).find((f) => f.kind === "expense_variance")!;
    expect(ev.metric).toBe("+47.6%");
  });
  it("flags open matters without a prediction and ignores closed matters", () => {
    expect(portfolioWatch([matter({ status: "open", outcome: null })], opts).map((f) => f.kind)).toEqual(["no_prediction"]);
    expect(portfolioWatch([matter({ outcome: outcome() })], opts)).toHaveLength(0);
  });
});

describe("filters and data quality", () => {
  it("parses only known, well-formed filter parameters", () => {
    expect(parseFilter({ status: "closed", from: "2020-01-01", evil: "x", to: "nope" })).toEqual({ status: "closed", from: "2020-01-01" });
  });
  it("filters by probability bin on the initial prediction", () => {
    const hi = matter({ outcome: outcome(), predictions: [pred({ probability: 0.85 })] });
    const lo = matter({ outcome: outcome(), predictions: [pred({ probability: 0.35 })] });
    expect(applyFilter([hi, lo], { pbin: "0.8-0.9" }).map((m) => m.id)).toEqual([hi.id]);
  });
  it("reports completeness against the right denominators", () => {
    const rows = dataQuality([matter({ outcome: outcome() }), matter({ outcome: null }), matter({ status: "open", outcome: null, referralId: null })]);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey.outcome!.numerator).toBe(1);
    expect(byKey.outcome!.denominator).toBe(2);
    expect(byKey.referral!.pct).toBeCloseTo(2 / 3);
  });
});
