"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createRuleAction, deleteRuleAction, toggleRuleAction } from "@/app/app/workflow-actions";
import { RULE_TYPES, type RuleParams, type RuleType } from "@/lib/rules";
import { EVENT_LABEL } from "@/lib/taxonomy";

type Opt = { key: string; label: string };
export type RuleDraft = { name: string; type: RuleType; params: RuleParams; sourceInsight: string | null };

const DEFAULT_PARAMS: Record<RuleType, RuleParams> = {
  expense_variance: { pct: 0.25 }, stale_assessment: { days: 120 }, matter_age: { months: 12 }, major_event: { eventTypes: ["mediation_held", "motion_decided"] },
  high_value: { amount: 1_000_000 }, high_capital: { amount: 100_000 }, high_probability: { pct: 0.9 }, referral_review: { referralIds: [] },
};

export function RuleForm({ initial, categories, referrals, onDone }: { initial?: RuleDraft | null; categories: Opt[]; referrals: Opt[]; onDone?: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<RuleType>(initial?.type ?? "expense_variance");
  const [params, setParams] = useState<RuleParams>(initial?.params ?? DEFAULT_PARAMS.expense_variance);
  const [name, setName] = useState(initial?.name ?? "");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  const p = (patch: Partial<RuleParams>) => setParams((x) => ({ ...x, ...patch }));
  const toggleIn = (k: "eventTypes" | "referralIds" | "categoryKeys", v: string) => p({ [k]: (params[k] ?? []).includes(v) ? (params[k] ?? []).filter((x) => x !== v) : [...(params[k] ?? []), v] });
  return (
    <div className="stack">
      {initial?.sourceInsight ? <div className="alert alert-info"><span>Template from a Firm Learning finding. Nothing is active until you create the rule.</span></div> : null}
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="rl-type">Rule type</label>
          <select id="rl-type" className="select" value={type} onChange={(e) => { const t = e.target.value as RuleType; setType(t); setParams(DEFAULT_PARAMS[t]); }}>
            {(Object.keys(RULE_TYPES) as RuleType[]).map((t) => <option key={t} value={t}>{RULE_TYPES[t].label}</option>)}
          </select></div>
        <div className="field"><label className="label" htmlFor="rl-name">Rule name</label><input id="rl-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={RULE_TYPES[type].label} maxLength={140} /></div>
      </div>
      <div className="grid-2">
        {type === "expense_variance" || type === "high_probability" ? <div className="field"><label className="label" htmlFor="rl-pct">{type === "expense_variance" ? "Variance above (%)" : "Assessed likelihood at or above (%)"}</label><input id="rl-pct" className="input" inputMode="numeric" value={Math.round((params.pct ?? 0) * 100)} onChange={(e) => p({ pct: Number(e.target.value) / 100 })} /></div> : null}
        {type === "stale_assessment" ? <div className="field"><label className="label" htmlFor="rl-days">No assessment confirmed for (days)</label><input id="rl-days" className="input" inputMode="numeric" value={params.days ?? 120} onChange={(e) => p({ days: Number(e.target.value) })} /></div> : null}
        {type === "matter_age" ? <div className="field"><label className="label" htmlFor="rl-mo">Matter open for (months)</label><input id="rl-mo" className="input" inputMode="numeric" value={params.months ?? 12} onChange={(e) => p({ months: Number(e.target.value) })} /></div> : null}
        {type === "high_value" || type === "high_capital" ? <div className="field"><label className="label" htmlFor="rl-amt">{type === "high_value" ? "Expected recovery midpoint at or above (USD)" : "Expected expense above (USD)"}</label><input id="rl-amt" className="input" inputMode="numeric" value={params.amount ?? ""} onChange={(e) => p({ amount: Number(e.target.value.replace(/[$,\s]/g, "")) })} /></div> : null}
      </div>
      {type === "major_event" ? <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">After these events</legend><div className="row-wrap" style={{ gap: 10 }}>
        {["mediation_held", "motion_decided", "discovery_closed", "deposition", "trial_set", "settlement_conference"].map((e) => <label key={e} className="check"><input type="checkbox" checked={(params.eventTypes ?? []).includes(e)} onChange={() => toggleIn("eventTypes", e)} /> {EVENT_LABEL[e]}</label>)}</div></fieldset> : null}
      {type === "referral_review" ? <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label">Referral sources under review</legend><div className="row-wrap" style={{ gap: 10 }}>
        {referrals.map((r) => <label key={r.key} className="check"><input type="checkbox" checked={(params.referralIds ?? []).includes(r.key)} onChange={() => toggleIn("referralIds", r.key)} /> {r.label}</label>)}</div><span className="help">Applies to matters from these sources opened after the rule is created.</span></fieldset> : null}
      {type !== "referral_review" ? <details><summary className="help" style={{ cursor: "pointer" }}>Limit to categories {params.categoryKeys?.length ? `(${params.categoryKeys.length})` : "(all)"}</summary>
        <div className="row-wrap" style={{ gap: 10, marginTop: 8 }}>{categories.map((c) => <label key={c.key} className="check"><input type="checkbox" checked={(params.categoryKeys ?? []).includes(c.key)} onChange={() => toggleIn("categoryKeys", c.key)} /> {c.label}</label>)}</div></details> : null}
      <p className="help">{RULE_TYPES[type].describe(params)} {RULE_TYPES[type].requirement === "second_review" ? "Cleared when a second reviewer records a review." : "Cleared when the assessment is updated or confirmed."}</p>
      {msg.error ? <div className="alert alert-error" role="alert">{msg.error}</div> : msg.ok ? <div className="alert alert-success">{msg.ok}</div> : null}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => start(async () => {
          const r = await createRuleAction({ name: name.trim() || RULE_TYPES[type].label, type, params, sourceInsight: initial?.sourceInsight ?? null });
          setMsg(r); if (!r.error) { router.refresh(); onDone?.(); }
        })}>{pending ? "Creating…" : "Create rule"}</button>
      </div>
    </div>
  );
}

export function RuleRowActions({ id, active, canManage }: { id: string; active: boolean; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  if (!canManage) return <span className={active ? "pos" : "muted"}>{active ? "Active" : "Paused"}</span>;
  return (
    <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
      <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await toggleRuleAction(id, !active); router.refresh(); })}>{active ? "Pause" : "Activate"}</button>
      {confirm ? <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => start(async () => { await deleteRuleAction(id); router.refresh(); })}>Delete rule</button>
        : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(true)}>Delete</button>}
    </span>
  );
}
