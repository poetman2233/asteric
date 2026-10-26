"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/Dialog";
import { reaffirmAction, submitAssessmentAction } from "@/app/app/workflow-actions";
import {
  LIKELIHOOD, RELATIVE, STRENGTH, STRENGTH_TO_BAND, STRENGTH_TO_LIKELIHOOD, roundDuration, roundExpense, scaleRange,
  type Baseline, type Likelihood, type Strength,
} from "@/lib/assessment";
import { DRIVERS, DRIVER_LABEL } from "@/lib/taxonomy";

export type PriorAssessment = {
  version: number; recoveryLow: number; recoveryHigh: number; probability: number;
  expectedDurationMonths: number | null; expectedExpense: number | null; confidence: string | null; drivers: string[]; recordedAt: string;
} | null;
export type FlowMoment = { id: string; label: string; prompt: string; note?: string | null } | null;

const usdK = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M` : `$${Math.round(n / 1000)}K`);
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const rng = (a: number, b: number) => `${usdK(a)}–${usdK(b)}`;
const days = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86400_000));

type Draft = {
  strength?: Strength; band?: number | "custom"; low?: number; high?: number; likelihood?: Likelihood; probability?: number;
  durationRel?: string; duration?: number; expenseRel?: string; expense?: number; drivers: string[]; confidence: "low" | "medium" | "high";
};

export function AssessmentFlow({ open, onClose, matterId, matterName, baseline, prior, moment, itemKey, sandbox, context }: {
  open: boolean; onClose: () => void; matterId: string; matterName: string; baseline: Baseline; prior: PriorAssessment;
  moment?: FlowMoment; itemKey?: string | null; sandbox: boolean; context: { expensesToDate: number | null; elapsedMonths: number | null };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // "quick" = full quick assessment; "update" = adaptive revision; "ask" = has your view changed?
  const [mode, setMode] = useState<"ask" | "quick" | "update">(prior ? "ask" : "quick");
  const [direction, setDirection] = useState<"improved" | "worsened">("improved");
  const [step, setStep] = useState(0);
  const [reason, setReason] = useState(moment ? `${moment.label}${moment.note ? `: ${moment.note}` : ""}` : "");
  const [d, setD] = useState<Draft>(() => prior ? {
    low: prior.recoveryLow, high: prior.recoveryHigh, probability: Math.round(prior.probability * 100),
    duration: prior.expectedDurationMonths ?? baseline.durationMonths, expense: prior.expectedExpense ?? baseline.expense,
    drivers: prior.drivers, confidence: (prior.confidence as Draft["confidence"]) ?? "medium",
  } : { drivers: [], confidence: "medium" });
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const quickSteps = ["strength", "recovery", "likelihood", "duration", "expense", "drivers", "summary"] as const;
  const updateSteps = ["likelihood", "recovery", "costs", "reason", "summary"] as const;
  const steps: readonly string[] = mode === "update" ? updateSteps : quickSteps;
  const cur = steps[step] ?? "summary";
  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1));
  const back = () => (step === 0 ? (prior ? setMode("ask") : onClose()) : setStep((s) => s - 1));

  const scope = baseline.n ? `${baseline.n} resolved ${baseline.fromCategory ? baseline.categoryLabel.toLowerCase() : ""} matters at your firm`.replace(/\s+/g, " ") : "your firm's defaults (no resolved history yet)";

  async function confirm() {
    setError(null);
    if (d.low == null || d.high == null || d.probability == null || d.duration == null || d.expense == null) { setError("Complete each answer first."); return; }
    if (prior && !reason.trim()) { setError("Note what prompted this update."); return; }
    start(async () => {
      const r = await submitAssessmentAction(matterId, {
        assessment: { recoveryLow: d.low!, recoveryHigh: d.high!, probability: d.probability! / 100, expectedDurationMonths: d.duration!, expectedExpense: d.expense!, confidence: d.confidence, drivers: d.drivers.slice(0, 3), revisionReason: prior ? reason.trim() : undefined },
        inputs: { mode: mode === "update" ? "update" : "quick", direction: mode === "update" ? direction : undefined, strength: d.strength, likelihood: d.likelihood, recoveryBand: d.band, durationRel: d.durationRel, expenseRel: d.expenseRel, baselineN: baseline.n, baselineScope: baseline.fromCategory ? baseline.categoryKey : "all" },
        momentId: moment?.id ?? null,
      });
      if (r.error) setError(r.error); else { setDone(r.ok ?? "Assessment recorded."); router.refresh(); }
    });
  }
  function noChange() {
    setError(null);
    start(async () => {
      const r = await reaffirmAction(matterId, { momentId: moment?.id ?? null, itemKey: itemKey ?? null, note: moment ? `Reviewed after ${moment.label.toLowerCase()}: no change` : null });
      if (r.error) setError(r.error); else { setDone(r.ok ?? "No change confirmed."); router.refresh(); }
    });
  }

  const title = done ? "Recorded" : mode === "ask" ? (moment?.prompt ?? "Has your view changed?") : prior ? "Update assessment" : "Case assessment";
  const progress = mode === "ask" || done ? null : <div className="qa-progress" aria-hidden="true">{steps.map((s, i) => <span key={s} data-on={i <= step} />)}</div>;

  return (
    <Dialog open={open} onClose={onClose} title={title} sub={matterName} wide>
      {progress}
      {done ? (
        <div className="stack">
          <div className="alert alert-success"><span>{done}</span></div>
          <p className="help">The assessment is locked. A later update is saved as a new version; this one stays in the decision ledger exactly as recorded.</p>
          <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn btn-primary" onClick={onClose}>Done</button></div>
        </div>
      ) : mode === "ask" && prior ? (
        <div className="stack">
          {moment ? <div className="alert alert-info"><span><strong>{moment.label}.</strong> {moment.note ?? ""}</span></div> : null}
          <div className="qa-last">
            <p className="eyebrow" style={{ marginBottom: 8 }}>Your last assessment · v{prior.version} · {days(prior.recordedAt)} days ago</p>
            <div className="qa-last-grid">
              <div><span>Expected recovery</span><b>{rng(prior.recoveryLow, prior.recoveryHigh)}</b></div>
              <div><span>Favorable</span><b>{Math.round(prior.probability * 100)}%</b></div>
              <div><span>Duration</span><b>{prior.expectedDurationMonths != null ? `${prior.expectedDurationMonths} months` : "—"}</b></div>
              <div><span>Expense</span><b>{prior.expectedExpense != null ? usdK(prior.expectedExpense) : "—"}</b></div>
            </div>
            {context.expensesToDate != null || context.elapsedMonths != null ? (
              <p className="help" style={{ marginTop: 10 }}>Today: {context.elapsedMonths != null ? `${context.elapsedMonths.toFixed(1)} months open` : ""}{context.expensesToDate != null ? ` · ${usd(context.expensesToDate)} expenses to date` : ""}</p>
            ) : null}
          </div>
          <div className="qa-opts qa-opts-row">
            <button type="button" className="qa-opt" disabled={pending} onClick={noChange}><b>No change</b><span>Record a timestamped confirmation</span></button>
            <button type="button" className="qa-opt" disabled={pending} onClick={() => { setMode("update"); setDirection("improved"); setStep(0); }}><b>Improved</b><span>Answer two or three questions</span></button>
            <button type="button" className="qa-opt" disabled={pending} onClick={() => { setMode("update"); setDirection("worsened"); setStep(0); }}><b>Worsened</b><span>Answer two or three questions</span></button>
            <button type="button" className="qa-opt" disabled={pending} onClick={() => { setMode("quick"); setStep(0); }}><b>Update details</b><span>Walk through the full assessment</span></button>
          </div>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        </div>
      ) : (
        <div className="stack">
          {cur === "strength" ? (
            <Q title="Compared with matters like this that you've handled before, how does this one feel at this stage?">
              <div className="qa-opts">{STRENGTH.map((o) => <Opt key={o.key} on={d.strength === o.key} onClick={() => {
                const b = baseline.bands[STRENGTH_TO_BAND[o.key]]!;
                set({ strength: o.key, ...(d.band === undefined && !prior ? { band: STRENGTH_TO_BAND[o.key], low: b.low, high: b.high } : {}), ...(!d.likelihood && !prior ? (() => { const l = LIKELIHOOD.find((x) => x.key === STRENGTH_TO_LIKELIHOOD[o.key])!; return { likelihood: l.key, probability: l.options[Math.floor(l.options.length / 2)] }; })() : {}) }); next();
              }}>{o.label}</Opt>)}</div>
            </Q>
          ) : null}

          {cur === "recovery" && mode === "quick" ? (
            <Q title="Where would you place the expected recovery today?" help={`Ranges are sized from favorable recoveries across ${scope}. The range is the recovery if the matter resolves favorably.`}>
              <div className="qa-opts">{baseline.bands.map((b, i) => <Opt key={i} on={d.band === i} onClick={() => { set({ band: i, low: b.low, high: b.high }); next(); }}>{rng(b.low, b.high)}</Opt>)}
                <Opt on={d.band === "custom"} onClick={() => set({ band: "custom" })}>Custom range</Opt></div>
              {d.band === "custom" ? <CustomRange low={d.low} high={d.high} onChange={(low, high) => set({ low, high })} onNext={next} /> : null}
            </Q>
          ) : null}

          {cur === "recovery" && mode === "update" && prior ? (
            <Q title="Where would you place the expected recovery now?" help={`Last assessment: ${rng(prior.recoveryLow, prior.recoveryHigh)}`}>
              <div className="qa-opts">
                {(direction === "improved" ? [1, 1.15, 1.3] : [1, 0.85, 0.7]).map((f) => { const r = scaleRange(prior.recoveryLow, prior.recoveryHigh, f); return (
                  <Opt key={f} on={d.low === r.low && d.high === r.high && d.band !== "custom"} onClick={() => { set({ low: f === 1 ? prior.recoveryLow : r.low, high: f === 1 ? prior.recoveryHigh : r.high, band: undefined }); next(); }}>
                    {f === 1 ? `Unchanged · ${rng(prior.recoveryLow, prior.recoveryHigh)}` : `${f > 1 ? "+" : "−"}${Math.round(Math.abs(f - 1) * 100)}% · ${rng(r.low, r.high)}`}
                  </Opt>); })}
                <Opt on={d.band === "custom"} onClick={() => set({ band: "custom" })}>Custom range</Opt>
              </div>
              {d.band === "custom" ? <CustomRange low={d.low} high={d.high} onChange={(low, high) => set({ low, high })} onNext={next} /> : null}
            </Q>
          ) : null}

          {cur === "likelihood" && mode === "quick" ? (
            <Q title="How would you describe the likelihood of a favorable resolution?">
              <div className="qa-opts">{LIKELIHOOD.map((o) => <Opt key={o.key} on={d.likelihood === o.key} onClick={() => set({ likelihood: o.key, probability: o.options[Math.floor(o.options.length / 2)] })}>{o.label}</Opt>)}</div>
              {d.likelihood ? (
                <div className="qa-confirm">
                  <span className="label">Closest to</span>
                  <div className="qa-chips">{LIKELIHOOD.find((o) => o.key === d.likelihood)!.options.map((n) => <button key={n} type="button" className="qa-chip" aria-pressed={d.probability === n} onClick={() => set({ probability: n })}>{n}%</button>)}</div>
                  <Stepper value={d.probability ?? 50} onChange={(v) => set({ probability: v })} />
                  <button type="button" className="btn btn-primary" onClick={next}>Continue</button>
                </div>
              ) : null}
            </Q>
          ) : null}

          {cur === "likelihood" && mode === "update" && prior ? (
            <Q title="How likely is a favorable resolution now?" help={`Last assessment: ${Math.round(prior.probability * 100)}%`}>
              <div className="qa-chips">{(direction === "improved" ? [0, 5, 10, 15] : [0, -5, -10, -15]).map((dd) => { const v = Math.max(1, Math.min(99, Math.round(prior.probability * 100) + dd)); return (
                <button key={dd} type="button" className="qa-chip" aria-pressed={d.probability === v} onClick={() => set({ probability: v })}>{dd === 0 ? `Unchanged · ${v}%` : `${v}%`}</button>); })}</div>
              <div className="qa-confirm"><Stepper value={d.probability ?? 50} onChange={(v) => set({ probability: v })} /><button type="button" className="btn btn-primary" onClick={next}>Continue</button></div>
            </Q>
          ) : null}

          {cur === "duration" ? (
            <Q title="Compared with a typical matter like this, expected duration?" help={`Typical: ${baseline.durationMonths} months from opening to resolution, across ${scope}.`}>
              <div className="qa-opts qa-opts-row">{RELATIVE.duration.map((o) => <Opt key={o.key} on={d.durationRel === o.key} onClick={() => set({ durationRel: o.key, duration: roundDuration(baseline.durationMonths * o.factor) })}>{o.label}</Opt>)}</div>
              {d.durationRel ? <Confirm label="Expected total duration" suffix="months" value={d.duration} onChange={(v) => set({ duration: v })} onNext={next} /> : null}
            </Q>
          ) : null}

          {cur === "expense" ? (
            <Q title="Expected litigation expense?" help={`Typical: ${usd(baseline.expense)} in total, across ${scope}.`}>
              <div className="qa-opts qa-opts-row">{RELATIVE.expense.map((o) => <Opt key={o.key} on={d.expenseRel === o.key} onClick={() => set({ expenseRel: o.key, expense: roundExpense(baseline.expense * o.factor) })}>{o.label}</Opt>)}</div>
              {d.expenseRel ? <Confirm label="Expected total expense" prefix="$" value={d.expense} onChange={(v) => set({ expense: v })} onNext={next} /> : null}
            </Q>
          ) : null}

          {cur === "costs" && prior ? (
            <Q title="Has anything changed on time or cost?">
              <div className="qa-two">
                <div>
                  <span className="label">Expected duration · last {prior.expectedDurationMonths ?? "—"} months{context.elapsedMonths != null ? ` · open ${context.elapsedMonths.toFixed(1)}` : ""}</span>
                  <div className="qa-chips">
                    {[["Unchanged", prior.expectedDurationMonths ?? baseline.durationMonths], ["Longer", roundDuration((prior.expectedDurationMonths ?? baseline.durationMonths) * 1.2)], ["Shorter", roundDuration((prior.expectedDurationMonths ?? baseline.durationMonths) * 0.85)]].map(([l, v]) => (
                      <button key={String(l)} type="button" className="qa-chip" aria-pressed={d.duration === v} onClick={() => set({ duration: Number(v), durationRel: String(l).toLowerCase() })}>{l} · {v} mo</button>))}
                  </div>
                  <NumberField value={d.duration} suffix="months" onChange={(v) => set({ duration: v })} />
                </div>
                <div>
                  <span className="label">Expected expense · last {prior.expectedExpense != null ? usd(prior.expectedExpense) : "—"}{context.expensesToDate != null ? ` · ${usd(context.expensesToDate)} spent` : ""}</span>
                  <div className="qa-chips">
                    {[["Unchanged", prior.expectedExpense ?? baseline.expense], ["Higher", roundExpense((prior.expectedExpense ?? baseline.expense) * 1.25)], ["Lower", roundExpense((prior.expectedExpense ?? baseline.expense) * 0.85)],
                      ...(context.expensesToDate != null && context.expensesToDate > (prior.expectedExpense ?? 0) ? [["At least spend to date", roundExpense(context.expensesToDate * 1.1)]] : [])].map(([l, v]) => (
                      <button key={String(l)} type="button" className="qa-chip" aria-pressed={d.expense === v} onClick={() => set({ expense: Number(v), expenseRel: String(l).toLowerCase() })}>{l} · {usdK(Number(v))}</button>))}
                  </div>
                  <NumberField value={d.expense} prefix="$" onChange={(v) => set({ expense: v })} />
                </div>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn btn-primary" onClick={next}>Continue</button></div>
            </Q>
          ) : null}

          {cur === "drivers" ? (
            <Q title="What is driving your view?" help="Choose up to three.">
              <div className="row-wrap" style={{ gap: 6 }}>{DRIVERS.map((x) => { const on = d.drivers.includes(x.key); return (
                <button key={x.key} type="button" className={`badge ${on ? "badge-accent" : "badge-outline"}`} aria-pressed={on} disabled={!on && d.drivers.length >= 3}
                  style={{ cursor: "pointer", height: 28, fontSize: 12, opacity: !on && d.drivers.length >= 3 ? 0.45 : 1 }}
                  onClick={() => set({ drivers: on ? d.drivers.filter((k) => k !== x.key) : [...d.drivers, x.key] })}>{on ? "✓ " : ""}{x.label}</button>); })}</div>
              <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn btn-primary" onClick={next}>Continue</button></div>
            </Q>
          ) : null}

          {cur === "reason" ? (
            <Q title="What prompted this update?">
              <textarea className="textarea" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Deposition of the HR director went well" autoFocus />
              <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn btn-primary" disabled={!reason.trim()} onClick={next}>Continue</button></div>
            </Q>
          ) : null}

          {cur === "summary" ? (
            <div className="stack">
              <p className="eyebrow" style={{ margin: 0 }}>Your assessment</p>
              <div className="qa-summary">
                <Row label="Expected recovery" value={d.low != null && d.high != null ? rng(d.low, d.high) : "—"} onEdit={mode === "quick" ? () => setStep(1) : () => setStep(1)} prior={prior ? rng(prior.recoveryLow, prior.recoveryHigh) : null} />
                <Row label="Favorable resolution" value={d.probability != null ? `~${d.probability}%` : "—"} onEdit={() => setStep(mode === "quick" ? 2 : 0)} prior={prior ? `${Math.round(prior.probability * 100)}%` : null} />
                <Row label="Expected duration" value={d.duration != null ? `${d.duration} months` : "—"} onEdit={() => setStep(mode === "quick" ? 3 : 2)} prior={prior?.expectedDurationMonths != null ? `${prior.expectedDurationMonths} months` : null} />
                <Row label="Expected expense" value={d.expense != null ? usdK(d.expense) : "—"} onEdit={() => setStep(mode === "quick" ? 4 : 2)} prior={prior?.expectedExpense != null ? usdK(prior.expectedExpense) : null} />
                <div className="qa-row"><span className="qa-k">Confidence</span><div className="seg" role="radiogroup" aria-label="Confidence">{(["low", "medium", "high"] as const).map((c) => <button key={c} type="button" role="radio" aria-checked={d.confidence === c} aria-pressed={d.confidence === c} onClick={() => set({ confidence: c })}>{c[0]!.toUpperCase() + c.slice(1)}</button>)}</div></div>
                <Row label="Drivers" value={d.drivers.length ? d.drivers.map((k) => DRIVER_LABEL[k] ?? k).join(" · ") : "None selected"} onEdit={mode === "quick" ? () => setStep(5) : undefined} />
                {prior ? <Row label="Reason" value={reason || "—"} onEdit={mode === "update" ? () => setStep(3) : undefined} /> : null}
              </div>
              {prior && mode === "quick" ? <div className="field"><label className="label" htmlFor="qa-reason">What prompted this update?</label><input id="qa-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></div> : null}
              <div className="alert alert-info"><span><strong>Attorney confirmation required.</strong> Asteric structured your answers; it did not estimate this matter. {sandbox ? "Demo workspace: this is saved as a sandbox assessment." : "Once confirmed, this version is locked."}</span></div>
              {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
              <div className="row" style={{ justifyContent: "space-between" }}>
                <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>Adjust</button>
                <button type="button" className="btn btn-primary" disabled={pending} aria-busy={pending} onClick={confirm}>{pending ? "Saving…" : "Confirm assessment"}</button>
              </div>
            </div>
          ) : null}

          {cur !== "summary" ? <div className="row" style={{ justifyContent: "space-between" }}><button type="button" className="btn btn-ghost btn-sm" onClick={back}>Back</button><span className="help">Step {step + 1} of {steps.length}</span></div> : null}
        </div>
      )}
    </Dialog>
  );
}

function Q({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return <div className="stack"><div><h3 className="qa-q">{title}</h3>{help ? <p className="help" style={{ marginTop: 4 }}>{help}</p> : null}</div>{children}</div>;
}
function Opt({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="qa-opt" aria-pressed={on} onClick={onClick}><b>{children}</b></button>;
}
function Row({ label, value, prior, onEdit }: { label: string; value: string; prior?: string | null; onEdit?: () => void }) {
  return (
    <div className="qa-row">
      <span className="qa-k">{label}</span>
      <span className="qa-v">{value}{prior && prior !== value ? <span className="help" style={{ display: "block", fontWeight: 400 }}>was {prior}</span> : null}</span>
      {onEdit ? <button type="button" className="link" style={{ fontSize: 12, background: "none", border: 0, cursor: "pointer" }} onClick={onEdit}>Adjust</button> : <span />}
    </div>
  );
}
function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="row" style={{ gap: 6 }} aria-label="Adjust probability">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(Math.max(1, value - 5))} aria-label="Decrease by 5">−5</button>
      <span className="num" style={{ minWidth: 48, textAlign: "center", fontWeight: 550 }}>{value}%</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(Math.min(99, value + 5))} aria-label="Increase by 5">+5</button>
    </div>
  );
}
function NumberField({ value, onChange, prefix, suffix }: { value?: number; onChange: (v: number) => void; prefix?: string; suffix?: string }) {
  return (
    <div className="row" style={{ gap: 6, marginTop: 8 }}>
      {prefix ? <span className="muted">{prefix}</span> : null}
      <input className="input input-sm" inputMode="decimal" style={{ width: 130 }} value={value ?? ""} onChange={(e) => { const n = Number(e.target.value.replace(/[$,\s]/g, "")); if (Number.isFinite(n)) onChange(n); }} />
      {suffix ? <span className="muted">{suffix}</span> : null}
    </div>
  );
}
function Confirm({ label, value, onChange, onNext, prefix, suffix }: { label: string; value?: number; onChange: (v: number) => void; onNext: () => void; prefix?: string; suffix?: string }) {
  return (
    <div className="qa-confirm">
      <span className="label">{label}</span>
      <NumberField value={value} onChange={onChange} prefix={prefix} suffix={suffix} />
      <button type="button" className="btn btn-primary" onClick={onNext} disabled={!value}>Continue</button>
    </div>
  );
}
function CustomRange({ low, high, onChange, onNext }: { low?: number; high?: number; onChange: (l: number, h: number) => void; onNext: () => void }) {
  const [l, setL] = useState(low ? String(low) : ""), [h, setH] = useState(high ? String(high) : "");
  const nl = Number(l.replace(/[$,\s]/g, "")), nh = Number(h.replace(/[$,\s]/g, ""));
  const ok = useMemo(() => nl > 0 && nh >= nl, [nl, nh]);
  return (
    <div className="qa-confirm">
      <input className="input input-sm" inputMode="decimal" placeholder="Low" aria-label="Low" style={{ width: 130 }} value={l} onChange={(e) => setL(e.target.value)} />
      <span className="muted">to</span>
      <input className="input input-sm" inputMode="decimal" placeholder="High" aria-label="High" style={{ width: 130 }} value={h} onChange={(e) => setH(e.target.value)} />
      <button type="button" className="btn btn-primary" disabled={!ok} onClick={() => { onChange(nl, nh); onNext(); }}>Use range</button>
    </div>
  );
}
