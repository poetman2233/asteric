/**
 * Decision Inbox: open matters that deserve a review, computed deterministically from
 * the firm's own assessments, the matter record, open Decision Moments and the firm's
 * review rules. Items describe how reality has moved against the firm's assumptions;
 * the attorney decides what that means.
 */
import type { MatterFact } from "./analytics/types";
import { daysBetween, monthsBetween } from "./analytics/stats";
import { EVENT_LABEL, MAJOR_EVENTS } from "./taxonomy";
import { MOMENT_LABEL, MOMENT_PROMPT } from "./moments";
import { evaluateRule, latestAssessment, latestSubstantive, RULE_TYPES, type Rule } from "./rules";

export type InboxKind = "moment" | "expense_drift" | "duration_drift" | "stale" | "needs_assessment" | "rule";
export type InboxItem = {
  key: string; kind: InboxKind; matterId: string; matterName: string; externalId: string | null; attorneyName: string | null;
  title: string; subtitle: string; rows: { label: string; value: string }[];
  cta: "review" | "assess" | "begin_review"; canConfirm: boolean; momentId?: string; ruleId?: string; ruleName?: string;
  severity: number; at: string;
  state?: { action: string; assignedLabel?: string | null; snoozeUntil?: string | null };
};
export type OpenMoment = { id: string; matterId: string; type: string; note: string | null; createdAt: string };
export type LatestAction = { action: string; assignedTo: string | null; assignedLabel: string | null; snoozeUntil: string | null; createdAt: string };
export type SecondReview = { matterId: string; decidedAt: string; decidedBy: string | null; decidedLabel: string };

export type InboxInput = {
  facts: MatterFact[]; moments: OpenMoment[]; rules: Rule[]; reviews: SecondReview[];
  actions: Map<string, LatestAction>; asOf: string; expenseThreshold: number; referralNames?: Record<string, string>;
};

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const signed = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
const range = (a: number, b: number) => { const f = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, "")}M` : `$${Math.round(n / 1000)}K`); return `${f(a)}–${f(b)}`; };

export function buildInbox(inp: InboxInput): { items: InboxItem[]; hidden: InboxItem[] } {
  const out: InboxItem[] = [];
  const momentsBy = new Map<string, OpenMoment[]>();
  for (const mo of inp.moments) momentsBy.set(mo.matterId, [...(momentsBy.get(mo.matterId) ?? []), mo]);
  const reviewBy = new Map<string, SecondReview[]>();
  for (const r of inp.reviews) reviewBy.set(r.matterId, [...(reviewBy.get(r.matterId) ?? []), r]);

  for (const m of inp.facts) {
    if (m.status !== "open") continue;
    const base = { matterId: m.id, matterName: m.name, externalId: m.externalId, attorneyName: m.attorneyName };
    const last = latestAssessment(m), sub = latestSubstantive(m);
    const lastDate = last?.recordedAt.slice(0, 10) ?? null;
    const lastAgo = lastDate ? `${daysBetween(lastDate, inp.asOf)} days ago` : "None";
    const assumption = sub ? `${range(sub.recoveryLow, sub.recoveryHigh)} · ${Math.round(sub.probability * 100)}% favorable` : "";
    const ms = momentsBy.get(m.id) ?? [];

    for (const mo of ms) {
      out.push({ ...base, key: `moment:${mo.id}`, kind: "moment", momentId: mo.id, title: MOMENT_LABEL[mo.type] ?? "Decision moment",
        subtitle: MOMENT_PROMPT[mo.type] ?? "Has this changed your assessment?",
        rows: [{ label: "Recorded", value: `${daysBetween(mo.createdAt.slice(0, 10), inp.asOf)} days ago` }, ...(mo.note ? [{ label: "Note", value: mo.note }] : []), ...(sub ? [{ label: "Last assessment", value: `${assumption} · ${lastAgo}` }] : [])],
        cta: last ? "review" : "assess", canConfirm: Boolean(last), severity: 3, at: mo.createdAt });
    }

    if (!last) {
      if (!ms.length && m.openedOn && daysBetween(m.openedOn, inp.asOf) <= 90) {
        out.push({ ...base, key: `assess:${m.id}`, kind: "needs_assessment", title: "Assessment needed", subtitle: "No assessment has been recorded for this matter yet.",
          rows: [{ label: "Opened", value: `${daysBetween(m.openedOn, inp.asOf)} days ago` }], cta: "assess", canConfirm: false, severity: 2, at: m.openedOn });
      }
    } else {
      if (sub?.expectedExpense && m.expensesToDate != null) {
        const v = m.expensesToDate / sub.expectedExpense - 1;
        if (v > inp.expenseThreshold) out.push({ ...base, key: `expense:${m.id}:${sub.id}`, kind: "expense_drift", title: "Expense drift", subtitle: "Expenses have moved past the latest expected total.",
          rows: [{ label: "Expected expense", value: usd(sub.expectedExpense) }, { label: "Current expense", value: usd(m.expensesToDate) }, { label: "Variance", value: signed(v) }, { label: "Last assessment", value: lastAgo }],
          cta: "review", canConfirm: true, severity: 4 + Math.min(2, v), at: last.recordedAt });
      }
      if (sub?.expectedDurationMonths && m.openedOn) {
        const el = monthsBetween(m.openedOn, inp.asOf);
        if (el > sub.expectedDurationMonths + 0.5) out.push({ ...base, key: `duration:${m.id}:${sub.id}`, kind: "duration_drift", title: "Duration drift", subtitle: "The matter has run past its expected total duration.",
          rows: [{ label: "Expected duration", value: `${sub.expectedDurationMonths} months` }, { label: "Current duration", value: `${el.toFixed(1)} months` }, { label: "Variance", value: `+${(el - sub.expectedDurationMonths).toFixed(1)} mo` }, { label: "Last assessment", value: lastAgo }],
          cta: "review", canConfirm: true, severity: 3 + Math.min(2, el / sub.expectedDurationMonths - 1), at: last.recordedAt });
      }
      // A recent major event since the last assessment, when no Decision Moment already covers it.
      if (!ms.length && lastDate) {
        const ev = [...m.events].reverse().find((e) => MAJOR_EVENTS.has(e.type) && e.occurredOn > lastDate && e.occurredOn <= inp.asOf && daysBetween(e.occurredOn, inp.asOf) <= 60);
        if (ev) out.push({ ...base, key: `stale:${m.id}:${last.id}`, kind: "stale", title: "Assessment stale", subtitle: "A major development has occurred since the last assessment.",
          rows: [{ label: "Last assessment", value: lastAgo }, { label: EVENT_LABEL[ev.type] ?? "Event", value: `${daysBetween(ev.occurredOn, inp.asOf)} days ago` }],
          cta: "review", canConfirm: true, severity: 2.5, at: ev.occurredOn });
      }
    }

    for (const rule of inp.rules) {
      if (!rule.active) continue;
      const match = evaluateRule(rule, m, inp.asOf, inp.referralNames);
      if (!match) continue;
      const keyBasis = match.requirement === "second_review" ? (sub?.id ?? "none") : (last?.id ?? "none");
      if (match.requirement === "second_review") {
        const after = sub?.recordedAt ?? "0000";
        const done = (reviewBy.get(m.id) ?? []).some((r) => r.decidedAt > after && (!sub?.authorLabel || r.decidedLabel !== sub.authorLabel));
        if (done) continue;
      }
      out.push({ ...base, key: `rule:${rule.id}:${m.id}:${keyBasis}`, kind: "rule", ruleId: rule.id, ruleName: rule.name,
        title: "Firm review rule", subtitle: `Meets your firm's review rule: ${rule.name}.`,
        rows: [...match.rows, { label: "Rule", value: `${RULE_TYPES[rule.type].label} · created by ${rule.createdByLabel}` }],
        cta: match.requirement === "second_review" ? "begin_review" : "review", canConfirm: match.requirement === "refresh" && Boolean(last), severity: match.requirement === "second_review" ? 5 : 3, at: rule.createdAt });
    }
  }

  const now = `${inp.asOf}T23:59:59.999Z`;
  const items: InboxItem[] = [], hidden: InboxItem[] = [];
  for (const it of out) {
    const a = inp.actions.get(it.key);
    if (a) it.state = { action: a.action, assignedLabel: a.assignedLabel, snoozeUntil: a.snoozeUntil };
    const gone = a && (a.action === "dismissed" || a.action === "confirmed" || (a.action === "snoozed" && a.snoozeUntil && a.snoozeUntil > now));
    (gone ? hidden : items).push(it);
  }
  items.sort((x, y) => y.severity - x.severity || (x.at < y.at ? 1 : -1));
  return { items, hidden };
}
