import { describe, expect, it } from "vitest";
import { generateDemo } from "@/server/demo/generate";
import { demoToFacts } from "@/server/demo/facts";
import { generateInsights } from "@/lib/analytics/insights";
import { portfolioWatch } from "@/lib/analytics/watch";

const a = { attorneyHourlyCost: 175, defaultContingencyRate: 0.4, expensesReimbursedFromRecovery: true };

describe("synthetic demo dataset", () => {
  it.each(["2026-10-17", "2027-04-02"])("produces the walkthrough patterns from the generating model (as of %s)", (asOf) => {
    const { matters } = generateDemo({ asOf });
    expect(matters.length).toBeGreaterThanOrEqual(500);
    expect(matters.length).toBeLessThanOrEqual(750);
    const facts = demoToFacts(matters);
    const kinds = new Set(generateInsights(facts, a, { asOf, staleDays: 180, expenseThreshold: 0.25 }).map((i) => i.kind));
    for (const k of ["Valuation", "Calibration", "Duration", "Expense", "Referral economics", "Attorney", "Portfolio watch"]) expect(kinds).toContain(k);
    const delgado = facts.find((m) => m.externalId === "KR-1843")!;
    expect(portfolioWatch([delgado], { asOf, staleDays: 180, expenseThreshold: 0.25 }).map((f) => f.kind)).toContain("expense_variance");
  });

  it("is internally consistent", () => {
    const { matters } = generateDemo({ asOf: "2026-10-17" });
    for (const m of matters) {
      expect(new Set(m.predictions.map((p) => p.version)).size).toBe(m.predictions.length);
      for (const p of m.predictions) {
        expect(p.recordedOn >= m.openedOn).toBe(true);
        expect(p.low).toBeLessThanOrEqual(p.high);
        if (m.outcome) expect(p.recordedOn < m.outcome.resolvedOn).toBe(true);
      }
      if (m.outcome) {
        expect(m.status).toBe("closed");
        expect(m.outcome.fee + m.outcome.netToClient).toBeLessThanOrEqual(m.outcome.gross + 1 + (m.outcome.favorable ? m.outcome.expenses : 0));
        if (!m.outcome.favorable) expect(m.outcome.gross).toBe(0);
      } else expect(m.status).toBe("open");
    }
    expect(new Set(matters.map((m) => m.externalId)).size).toBe(matters.length);
  });
});
