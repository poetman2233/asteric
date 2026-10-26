import { describe, expect, it } from "vitest";
import { baselineFor } from "@/lib/assessment";
import { templateForInsight } from "@/lib/rules";

describe("assessment baselines", () => {
  it("falls back to sensible defaults with no firm history", () => {
    const b = baselineFor([], "retaliation", "Retaliation");
    expect(b.n).toBe(0);
    expect(b.durationMonths).toBeGreaterThan(0);
    expect(b.bands).toHaveLength(5);
  });
});

describe("rule templates from Firm Learning", () => {
  const labels = { categories: { retaliation: "Retaliation" }, referrals: { abc: "Pacific" } };
  it("maps findings to the matching rule type", () => {
    expect(templateForInsight("valuation-gt1m", labels)?.type).toBe("high_value");
    expect(templateForInsight("valuation-gt1m", labels)?.params.amount).toBe(1_000_000);
    expect(templateForInsight("referral-abc", labels)?.params.referralIds).toEqual(["abc"]);
    expect(templateForInsight("unknown-x", labels)).toBeNull();
  });
});
