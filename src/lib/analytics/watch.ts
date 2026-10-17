import type { MatterFact, PredictionFact } from "./types";
import { daysBetween, monthsBetween } from "./stats";
import { MAJOR_EVENTS, EVENT_LABEL } from "@/lib/taxonomy";

export type WatchKind = "expense_variance" | "duration_exceeded" | "duration_approaching" | "unrevised_major_event" | "stale_prediction" | "no_prediction" | "missing_fields";
export type WatchFlag = {
  matterId: string; matterName: string; attorneyName: string | null;
  kind: WatchKind; severity: "high" | "medium" | "low";
  title: string; detail: string; metric: string | null; sortValue: number;
};

export const WATCH_LABEL: Record<WatchKind, string> = {
  expense_variance: "Expense variance",
  duration_exceeded: "Duration exceeded",
  duration_approaching: "Duration approaching forecast",
  unrevised_major_event: "Major event since latest prediction",
  stale_prediction: "Prediction not reviewed recently",
  no_prediction: "No recorded prediction",
  missing_fields: "Key fields missing",
};

const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

export function latestPrediction(m: MatterFact): PredictionFact | null {
  return m.predictions.length ? m.predictions[m.predictions.length - 1]! : null;
}

/**
 * Portfolio Watch: open matters whose current facts have moved away from the assumptions
 * in their latest recorded prediction. Flags prompt review; they never recommend a legal decision.
 */
export function portfolioWatch(ms: MatterFact[], opts: { asOf: string; staleDays: number; expenseThreshold: number }): WatchFlag[] {
  const flags: WatchFlag[] = [];
  for (const m of ms) {
    if (m.status !== "open") continue;
    const base = { matterId: m.id, matterName: m.name, attorneyName: m.attorneyName };
    const latest = latestPrediction(m);
    if (!m.categoryKey || !m.attorneyId || !m.openedOn) {
      const missing = [!m.categoryKey && "category", !m.attorneyId && "lead attorney", !m.openedOn && "date opened"].filter(Boolean).join(", ");
      flags.push({ ...base, kind: "missing_fields", severity: "low", title: "Key fields missing", detail: `Missing ${missing}.`, metric: null, sortValue: 0 });
    }
    if (!latest) {
      flags.push({ ...base, kind: "no_prediction", severity: "medium", title: "No recorded prediction", detail: "This active matter has no recorded expectation to measure against.", metric: null, sortValue: m.openedOn ? daysBetween(m.openedOn, opts.asOf) : 0 });
      continue;
    }
    const age = daysBetween(latest.recordedAt.slice(0, 10), opts.asOf);
    if (m.expensesToDate != null && latest.expectedExpense != null && latest.expectedExpense > 0) {
      const v = m.expensesToDate / latest.expectedExpense - 1;
      if (v > opts.expenseThreshold) {
        flags.push({ ...base, kind: "expense_variance", severity: v > 0.5 ? "high" : "medium", title: "Expense variance",
          detail: `Incurred ${usd(m.expensesToDate)} against a latest predicted expense of ${usd(latest.expectedExpense)}. Latest prediction: ${age} days ago.`, metric: pct(v), sortValue: v });
      }
    }
    if (m.openedOn) {
      const elapsed = monthsBetween(m.openedOn, opts.asOf);
      const expected = latest.expectedDurationMonths ?? 0;
      if (expected > 0 && elapsed > expected) {
        flags.push({ ...base, kind: "duration_exceeded", severity: elapsed > expected * 1.25 ? "high" : "medium", title: "Duration exceeded",
          detail: `Open ${elapsed.toFixed(1)} months against an expected total duration of ${expected.toFixed(1)} months.`, metric: `+${(elapsed - expected).toFixed(1)} mo`, sortValue: elapsed / expected });
      } else if (expected > 0 && elapsed >= expected * 0.9) {
        flags.push({ ...base, kind: "duration_approaching", severity: "low", title: "Duration approaching forecast",
          detail: `Open ${elapsed.toFixed(1)} of an expected ${expected.toFixed(1)} months.`, metric: `${Math.round((elapsed / expected) * 100)}%`, sortValue: elapsed / expected });
      }
    }
    const after = m.events.filter((e) => MAJOR_EVENTS.has(e.type) && e.occurredOn > latest.recordedAt.slice(0, 10) && e.occurredOn <= opts.asOf);
    if (after.length) {
      const last = after[after.length - 1]!;
      flags.push({ ...base, kind: "unrevised_major_event", severity: "medium", title: "Major event since latest prediction",
        detail: `${EVENT_LABEL[last.type] ?? last.type} on ${last.occurredOn}; no revision recorded since.`, metric: `${after.length} event${after.length > 1 ? "s" : ""}`, sortValue: after.length });
    }
    if (age > opts.staleDays) {
      flags.push({ ...base, kind: "stale_prediction", severity: "low", title: "Prediction not reviewed recently",
        detail: `Latest prediction recorded ${age} days ago.`, metric: `${age} d`, sortValue: age });
    }
  }
  const order = { high: 0, medium: 1, low: 2 };
  return flags.sort((a, b) => order[a.severity] - order[b.severity] || b.sortValue - a.sortValue);
}
