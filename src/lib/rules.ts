/**
 * Firm review rules. Rules are created by the firm; Asteric only evaluates them.
 * Copy always says "meets your firm's review criteria", never that Asteric recommends anything.
 */
import type { MatterFact, PredictionFact } from "./analytics/types";
import { daysBetween, monthsBetween } from "./analytics/stats";
import { EVENT_LABEL } from "./taxonomy";

export type RuleType = "expense_variance" | "stale_assessment" | "matter_age" | "major_event" | "high_value" | "high_capital" | "high_probability" | "referral_review";
export type RuleParams = {
  pct?: number; days?: number; months?: number; amount?: number;
  eventTypes?: string[]; referralIds?: string[]; categoryKeys?: string[];
};
export type Rule = { id: string; name: string; type: RuleType; params: RuleParams; active: boolean; createdAt: string; createdByLabel: string; sourceInsight: string | null };

/** "refresh": cleared by a newer assessment or a "no change" confirmation. "second_review": cleared by a second review recorded by someone other than the assessment's author. */
export const RULE_TYPES: Record<RuleType, { label: string; requirement: "refresh" | "second_review"; describe: (p: RuleParams) => string }> = {
  expense_variance: { label: "Expense variance", requirement: "refresh", describe: (p) => `Flag when actual expenses exceed the latest forecast by ${Math.round((p.pct ?? 0.25) * 100)}%.` },
  stale_assessment: { label: "Stale assessment", requirement: "refresh", describe: (p) => `Flag when no assessment has been confirmed for ${p.days ?? 120} days.` },
  matter_age: { label: "Matter age", requirement: "refresh", describe: (p) => `Request an assessment refresh when a matter has been open ${p.months ?? 12} months.` },
  major_event: { label: "Major event", requirement: "refresh", describe: (p) => `Request an assessment refresh after ${(p.eventTypes ?? []).map((e) => (EVENT_LABEL[e] ?? e).toLowerCase()).join(" or ") || "a major event"}.` },
  high_value: { label: "High-value assessment", requirement: "second_review", describe: (p) => `Require a second review when the expected recovery midpoint is ${usd(p.amount ?? 1_000_000)} or more.` },
  high_capital: { label: "High-capital matter", requirement: "second_review", describe: (p) => `Require a second review when expected expense exceeds ${usd(p.amount ?? 100_000)}.` },
  high_probability: { label: "High-confidence assessment", requirement: "second_review", describe: (p) => `Require a second review when the assessed likelihood is ${Math.round((p.pct ?? 0.9) * 100)}% or higher.` },
  referral_review: { label: "Referral source review", requirement: "second_review", describe: () => "Require a second review for new matters from referral sources management has placed under review." },
};

function usd(n: number) { return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `$${Math.round(n / 1000)}K`; }
const pct = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;

export type RuleMatch = { rows: { label: string; value: string }[]; requirement: "refresh" | "second_review" };

export function latestAssessment(m: MatterFact): PredictionFact | null { return m.predictions[m.predictions.length - 1] ?? null; }
export function latestSubstantive(m: MatterFact): PredictionFact | null {
  for (let i = m.predictions.length - 1; i >= 0; i--) if (!m.predictions[i]!.isReaffirmation) return m.predictions[i]!;
  return null;
}

/** Evaluates one rule against one open matter. Returns null when the matter does not meet the criteria. */
export function evaluateRule(rule: Rule, m: MatterFact, asOf: string, referralNames: Record<string, string> = {}): RuleMatch | null {
  if (m.status !== "open") return null;
  const p = rule.params;
  if (p.categoryKeys?.length && (!m.categoryKey || !p.categoryKeys.includes(m.categoryKey))) return null;
  const last = latestAssessment(m), sub = latestSubstantive(m);
  const req = RULE_TYPES[rule.type].requirement;
  switch (rule.type) {
    case "expense_variance": {
      if (!last?.expectedExpense || m.expensesToDate == null) return null;
      const v = m.expensesToDate / last.expectedExpense - 1;
      if (v <= (p.pct ?? 0.25)) return null;
      return { requirement: req, rows: [{ label: "Expected expense", value: `$${Math.round(last.expectedExpense).toLocaleString("en-US")}` }, { label: "Current expense", value: `$${Math.round(m.expensesToDate).toLocaleString("en-US")}` }, { label: "Variance", value: pct(v) }] };
    }
    case "stale_assessment": {
      if (!last) return null;
      const d = daysBetween(last.recordedAt.slice(0, 10), asOf);
      if (d < (p.days ?? 120)) return null;
      return { requirement: req, rows: [{ label: "Last assessment", value: `${d} days ago` }, { label: "Rule", value: `${p.days ?? 120} days` }] };
    }
    case "matter_age": {
      if (!m.openedOn) return null;
      const age = monthsBetween(m.openedOn, asOf), limit = p.months ?? 12;
      if (age < limit) return null;
      const reached = addMonthsIso(m.openedOn, limit);
      if (last && last.recordedAt.slice(0, 10) >= reached) return null;
      return { requirement: req, rows: [{ label: "Open", value: `${age.toFixed(1)} months` }, { label: "Rule", value: `${limit} months` }, { label: "Last assessment", value: last ? `${daysBetween(last.recordedAt.slice(0, 10), asOf)} days ago` : "None" }] };
    }
    case "major_event": {
      const types = p.eventTypes ?? [];
      const since = last?.recordedAt.slice(0, 10) ?? "0000";
      const ev = [...m.events].reverse().find((e) => types.includes(e.type) && e.occurredOn > since && e.occurredOn <= asOf);
      if (!ev) return null;
      return { requirement: req, rows: [{ label: "Event", value: `${EVENT_LABEL[ev.type] ?? ev.type}, ${daysBetween(ev.occurredOn, asOf)} days ago` }, { label: "Last assessment", value: last ? `${daysBetween(last.recordedAt.slice(0, 10), asOf)} days ago` : "None" }] };
    }
    case "high_value": {
      if (!sub) return null;
      const mid = (sub.recoveryLow + sub.recoveryHigh) / 2;
      if (mid < (p.amount ?? 1_000_000)) return null;
      return { requirement: req, rows: [{ label: "Expected recovery", value: `${usd(sub.recoveryLow)}–${usd(sub.recoveryHigh)}` }, { label: "Rule threshold", value: `${usd(p.amount ?? 1_000_000)} midpoint` }] };
    }
    case "high_capital": {
      if (!sub?.expectedExpense || sub.expectedExpense <= (p.amount ?? 100_000)) return null;
      return { requirement: req, rows: [{ label: "Expected expense", value: `$${Math.round(sub.expectedExpense).toLocaleString("en-US")}` }, { label: "Rule threshold", value: usd(p.amount ?? 100_000) }] };
    }
    case "high_probability": {
      if (!sub || sub.probability < (p.pct ?? 0.9)) return null;
      return { requirement: req, rows: [{ label: "Assessed likelihood", value: `${Math.round(sub.probability * 100)}% favorable` }, { label: "Rule threshold", value: `${Math.round((p.pct ?? 0.9) * 100)}%` }] };
    }
    case "referral_review": {
      if (!m.referralId || !(p.referralIds ?? []).includes(m.referralId)) return null;
      if (!m.openedOn || m.openedOn < rule.createdAt.slice(0, 10)) return null;
      return { requirement: req, rows: [{ label: "Referral source", value: referralNames[m.referralId] ?? m.referralName ?? "Under review" }, { label: "Opened", value: m.openedOn }] };
    }
  }
}

function addMonthsIso(d: string, months: number) {
  const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + Math.round(months * 30.4375)); return x.toISOString().slice(0, 10);
}

/** A rule template offered beside a Firm Learning finding. Management decides whether to create it. */
export function templateForInsight(insightId: string, labels: { categories: Record<string, string>; referrals: Record<string, string> }): { name: string; type: RuleType; params: RuleParams } | null {
  const [kind, ...rest] = insightId.split("-");
  const arg = rest.join("-");
  if (kind === "valuation") {
    const amount = ({ gt1m: 1_000_000, "500to1m": 500_000, "250to500": 250_000, "100to250": 100_000 } as Record<string, number>)[arg] ?? 1_000_000;
    return { name: `Second assessment for matters forecast at ${usd(amount)} or more`, type: "high_value", params: { amount } };
  }
  if (kind === "calibration") { const lo = Number(arg); return { name: `Second review for assessments of ${Math.round(lo * 100)}% or higher`, type: "high_probability", params: { pct: lo } }; }
  if (kind === "duration") return { name: `Refresh ${labels.categories[arg] ?? "these"} assessments at 12 months`, type: "matter_age", params: { months: 12, categoryKeys: [arg] } };
  if (kind === "expense") return { name: `Expense variance review for ${labels.categories[arg] ?? "these"} matters`, type: "expense_variance", params: { pct: 0.2, categoryKeys: [arg] } };
  if (kind === "referral") return { name: `Second review for new ${labels.referrals[arg] ?? "referral source"} matters`, type: "referral_review", params: { referralIds: [arg] } };
  if (insightId === "watch-expense") return { name: "Expense variance above 25%", type: "expense_variance", params: { pct: 0.25 } };
  return null;
}
