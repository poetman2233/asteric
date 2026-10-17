import type { EconomicsAssumptions, MatterFact } from "./types";
import { median, monthsBetween, sum } from "./stats";

/**
 * Return on Legal Capital (ROLC), V1 methodology.
 *
 *   Capital committed (expense-only)   = litigation expenses advanced
 *   Capital committed (fully costed)   = expenses + attorney hours × configured hourly cost
 *   Return to the firm                 = net fee + expenses reimbursed from the recovery
 *     net fee            = attorney fee − referral fee paid
 *     expenses reimbursed = min(expenses, gross recovery) on a favorable resolution,
 *                           when the organization assumes expenses are reimbursed (default)
 *   ROLC = return / capital committed  (a multiple: 1.0× is break-even)
 *
 * Portfolio and group ROLC aggregate as Σ return / Σ capital (not an average of ratios),
 * so large matters weigh in proportion to the capital they consumed.
 * Fully costed ROLC is reported only where hours and an hourly cost are both available.
 * Nothing is imputed except an optional, organization-configured contingency fee rate,
 * which is labelled "derived" wherever it is used.
 */
export type MatterEconomics = {
  matterId: string;
  included: boolean;
  exclusionReason?: "unresolved" | "missing_fee" | "missing_expenses" | "zero_capital";
  feeDerived: boolean;
  grossRecovery: number | null;
  netFee: number;
  expenses: number;
  reimbursed: number;
  return: number;
  capitalExpense: number;
  capitalFull: number | null;
  rolcExpense: number | null;
  rolcFull: number | null;
  durationMonths: number | null;
};

export function matterEconomics(m: MatterFact, a: EconomicsAssumptions): MatterEconomics {
  const base = { matterId: m.id, feeDerived: false, grossRecovery: m.outcome?.grossRecovery ?? null, netFee: 0, expenses: 0, reimbursed: 0, return: 0, capitalExpense: 0, capitalFull: null, rolcExpense: null, rolcFull: null, durationMonths: null };
  const o = m.outcome;
  if (!o) return { ...base, included: false, exclusionReason: "unresolved" };
  let fee = o.attorneyFee;
  let feeDerived = false;
  if (fee == null) {
    if (!o.favorable) fee = 0;
    else if (a.defaultContingencyRate != null && o.grossRecovery != null) { fee = a.defaultContingencyRate * o.grossRecovery; feeDerived = true; }
  }
  if (fee == null) return { ...base, included: false, exclusionReason: "missing_fee" };
  const expenses = o.litigationExpenses ?? m.expensesToDate;
  if (expenses == null) return { ...base, feeDerived, included: false, exclusionReason: "missing_expenses" };

  const netFee = Math.max(0, fee - (o.referralFeePaid ?? 0));
  const reimbursed = o.favorable && a.expensesReimbursedFromRecovery ? Math.min(expenses, o.grossRecovery ?? expenses) : 0;
  const ret = netFee + reimbursed;
  const hours = o.attorneyHours ?? m.attorneyHours;
  const timeCost = hours != null && a.attorneyHourlyCost != null ? hours * a.attorneyHourlyCost : null;
  const capitalFull = timeCost != null ? expenses + timeCost : null;
  const durationMonths = m.openedOn ? monthsBetween(m.openedOn, o.resolvedOn) : null;
  if (expenses <= 0 && !(capitalFull && capitalFull > 0)) {
    return { ...base, feeDerived, netFee, expenses, reimbursed, return: ret, durationMonths, included: false, exclusionReason: "zero_capital" };
  }
  return {
    matterId: m.id, included: true, feeDerived, grossRecovery: o.grossRecovery, netFee, expenses, reimbursed, return: ret,
    capitalExpense: expenses, capitalFull,
    rolcExpense: expenses > 0 ? ret / expenses : null,
    rolcFull: capitalFull && capitalFull > 0 ? ret / capitalFull : null,
    durationMonths,
  };
}

export type GroupEconomics = {
  key: string;
  label: string;
  matters: number;
  resolved: number;
  favorableRate: number | null;
  medianRecovery: number | null;
  totalNetFees: number;
  medianDuration: number | null;
  medianExpense: number | null;
  capitalDeployed: number;
  rolcExpense: number | null;
  rolcFull: number | null;
  included: number;
  excluded: number;
  feeDerivedCount: number;
  matterIds: string[];
};

export function aggregateEconomics(key: string, label: string, ms: MatterFact[], a: EconomicsAssumptions): GroupEconomics {
  const resolved = ms.filter((m) => m.outcome);
  const econ = resolved.map((m) => matterEconomics(m, a));
  const inc = econ.filter((e) => e.included);
  const capE = sum(inc.map((e) => e.capitalExpense));
  const full = inc.filter((e) => e.capitalFull != null);
  const capF = sum(full.map((e) => e.capitalFull!));
  return {
    key, label,
    matters: ms.length,
    resolved: resolved.length,
    favorableRate: resolved.length ? resolved.filter((m) => m.outcome!.favorable).length / resolved.length : null,
    medianRecovery: median(resolved.filter((m) => m.outcome!.favorable && m.outcome!.grossRecovery != null).map((m) => m.outcome!.grossRecovery!)),
    totalNetFees: sum(inc.map((e) => e.netFee)),
    medianDuration: median(econ.filter((e) => e.durationMonths != null).map((e) => e.durationMonths!)),
    medianExpense: median(inc.map((e) => e.expenses)),
    capitalDeployed: capE,
    rolcExpense: capE > 0 ? sum(inc.map((e) => e.return)) / capE : null,
    // Fully costed is shown only when most included matters carry hours.
    rolcFull: full.length > 0 && full.length >= inc.length * 0.8 && capF > 0 ? sum(full.map((e) => e.return)) / capF : null,
    included: inc.length,
    excluded: econ.length - inc.length,
    feeDerivedCount: inc.filter((e) => e.feeDerived).length,
    matterIds: ms.map((m) => m.id),
  };
}

export type Dimension = "category" | "attorney" | "referral" | "jurisdiction" | "year";

export function dimensionKey(m: MatterFact, d: Dimension): { key: string; label: string } {
  switch (d) {
    case "category": return { key: m.categoryKey ?? "__none", label: m.categoryLabel ?? "Uncategorized" };
    case "attorney": return { key: m.attorneyId ?? "__none", label: m.attorneyName ?? "Unassigned" };
    case "referral": return { key: m.referralId ?? "__none", label: m.referralName ?? "No referral source" };
    case "jurisdiction": return { key: m.jurisdiction ?? "__none", label: m.jurisdiction ?? "Unknown jurisdiction" };
    case "year": {
      const y = (m.outcome?.resolvedOn ?? m.openedOn ?? "").slice(0, 4);
      return { key: y || "__none", label: y ? `Resolved ${y}` : "Unknown year" };
    }
  }
}

export function economicsBy(ms: MatterFact[], d: Dimension, a: EconomicsAssumptions): GroupEconomics[] {
  const groups = new Map<string, { label: string; items: MatterFact[] }>();
  for (const m of ms) {
    const k = dimensionKey(m, d);
    const g = groups.get(k.key) ?? { label: k.label, items: [] };
    g.items.push(m);
    groups.set(k.key, g);
  }
  return [...groups.entries()].map(([key, g]) => aggregateEconomics(key, g.label, g.items, a));
}

/** Minimum resolved matters before a group is ranked in comparisons. */
export const MIN_GROUP_RESOLVED = 15;
