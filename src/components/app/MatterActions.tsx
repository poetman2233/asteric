"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AssessmentFlow, type FlowMoment, type PriorAssessment } from "@/components/app/AssessmentFlow";
import { markDevelopmentAction, recordDecisionAction } from "@/app/app/workflow-actions";
import type { Baseline } from "@/lib/assessment";
import { Dialog } from "@/components/ui/Dialog";
import { FormMessage, SubmitButton } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import {
  addEventAction, addOfferAction, recordOutcomeAction, recordPredictionAction, updateFinancialsAction, type ActionResult,
} from "@/app/app/actions";
import { DRIVERS, EVENT_TYPES, RESOLUTIONS } from "@/lib/taxonomy";

type Bound = (s: ActionResult, fd: FormData) => Promise<ActionResult>;

function ActionDialog({ open, onClose, title, sub, action, submit, children, wide, onMoment }: {
  open: boolean; onClose: () => void; title: string; sub?: React.ReactNode; action: Bound; submit: string; children: React.ReactNode; wide?: boolean;
  /** Called when the save opened a Decision Moment, so the attorney can confirm or update the assessment right away. */
  onMoment?: (momentId: string) => void;
}) {
  const [state, formAction] = useActionState(action, {});
  useEffect(() => {
    if (!state.ok) return;
    const momentId = state.data?.momentId as string | undefined;
    const t = setTimeout(() => (momentId && onMoment ? onMoment(momentId) : onClose()), momentId && onMoment ? 500 : 1100);
    return () => clearTimeout(t);
  }, [state, onClose, onMoment]);
  return (
    <Dialog open={open} onClose={onClose} title={title} sub={sub} wide={wide}>
      <form action={formAction} className="stack">
        {children}
        <FormMessage state={state} />
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <SubmitButton pendingLabel="Saving…" disabled={Boolean(state.ok)}>{submit}</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const money = (n: number | null | undefined) => (n == null ? "" : String(Math.round(n)));

export type PrevPrediction = {
  version: number; recoveryLow: number; recoveryHigh: number; probability: number;
  expectedDurationMonths: number | null; expectedExpense: number | null; confidence: string | null; drivers: string[];
} | null;

export type MatterPermissions = { predict: boolean; sandbox: boolean; events: boolean; outcome: boolean; edit: boolean; decide: boolean };

export type FlowProps = {
  matterName: string; baseline: Baseline; prior: PriorAssessment; context: { expensesToDate: number | null; elapsedMonths: number | null };
  moments: { id: string; type: string; label: string; prompt: string; note: string | null }[];
  events: { id: string; label: string }[];
  auto: { reviewKey: string | null; momentId: string | null; second: boolean };
};

export function MatterActions({ matterId, open: isOpen, prev, perms, financials, flow }: {
  matterId: string; open: boolean; prev: PrevPrediction; perms: MatterPermissions; financials: { expensesToDate: number | null; attorneyHours: number | null }; flow: FlowProps;
}) {
  const router = useRouter();
  const canPredict = isOpen && (perms.predict || perms.sandbox);
  const autoMoment = flow.auto.momentId ? flow.moments.find((m) => m.id === flow.auto.momentId) ?? null : null;
  const [dlg, setDlg] = useState<null | "predict" | "assess" | "event" | "offer" | "outcome" | "financials" | "decision" | "development">(
    flow.auto.second && perms.decide ? "decision" : (flow.auto.reviewKey || flow.auto.momentId) && canPredict ? "assess" : null);
  const [moment, setMoment] = useState<FlowMoment>(autoMoment);
  const close = () => { setDlg(null); setMoment(null); if (flow.auto.reviewKey || flow.auto.momentId) router.replace(`/app/matters/${matterId}`, { scroll: false }); };
  const openMoment = (id: string) => { router.refresh(); setMoment({ id, label: "Development recorded", prompt: "Has this changed your assessment?", note: null }); setDlg(canPredict ? "assess" : null); };
  return (
    <>
      <div className="row-wrap" style={{ gap: 8 }}>
        {canPredict ? (
          <button type="button" className="btn btn-primary" onClick={() => { setMoment(flow.moments[0] ?? null); setDlg("assess"); }}>
            {prev ? "Review assessment" : "Assess matter"}
          </button>
        ) : null}
        {perms.decide && isOpen ? <button type="button" className="btn btn-secondary" onClick={() => setDlg("decision")}>Record decision</button> : null}
        {perms.events && isOpen ? <button type="button" className="btn btn-secondary" onClick={() => setDlg("development")}>Mark development</button> : null}
        {perms.events ? <button type="button" className="btn btn-secondary" onClick={() => setDlg("event")}>Add event</button> : null}
        {perms.events ? <button type="button" className="btn btn-secondary" onClick={() => setDlg("offer")}>Add offer</button> : null}
        {perms.edit && isOpen ? <button type="button" className="btn btn-secondary" onClick={() => setDlg("financials")}>Update financials</button> : null}
        {perms.outcome ? <button type="button" className="btn btn-secondary" onClick={() => setDlg("outcome")}>{isOpen ? "Record outcome" : "Correct outcome"}</button> : null}
      </div>

      {dlg === "predict" ? <PredictionDialog matterId={matterId} prev={prev} sandbox={perms.sandbox && !perms.predict} onClose={close} /> : null}
      {dlg === "assess" ? <AssessmentFlow open onClose={close} matterId={matterId} matterName={flow.matterName} baseline={flow.baseline} prior={flow.prior} moment={moment} itemKey={flow.auto.reviewKey} sandbox={perms.sandbox && !perms.predict} context={flow.context} /> : null}
      {dlg === "decision" ? <DecisionDialog matterId={matterId} events={flow.events} second={flow.auto.second} itemKey={flow.auto.reviewKey} onClose={close} /> : null}
      {dlg === "development" ? <DevelopmentDialog matterId={matterId} onClose={close} onMoment={openMoment} /> : null}

      {dlg === "event" ? (
        <ActionDialog open onClose={close} onMoment={openMoment} title="Add procedural event" action={addEventAction.bind(null, matterId)} submit="Add event">
          <div className="grid-2">
            <div className="field"><label className="label" htmlFor="ev-type">Event type</label>
              <select id="ev-type" name="type" className="select" required defaultValue="deposition">
                {EVENT_TYPES.filter((e) => e.key !== "matter_opened").map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
              </select>
            </div>
            <div className="field"><label className="label" htmlFor="ev-date">Date</label><input id="ev-date" name="occurredOn" type="date" className="input" required defaultValue={today()} max={today()} /></div>
          </div>
          <div className="field"><label className="label" htmlFor="ev-title">Title</label><input id="ev-title" name="title" className="input" required minLength={2} maxLength={160} placeholder="Deposition of the HR director" /></div>
          <div className="field"><label className="label" htmlFor="ev-amt">Amount (optional)</label><input id="ev-amt" name="amount" className="input" inputMode="decimal" placeholder="Expert invoice amount, if any" /><span className="help">For an expert expense, the amount is added to expenses to date.</span></div>
          <div className="field"><label className="label" htmlFor="ev-desc">Notes (optional)</label><textarea id="ev-desc" name="description" className="textarea" maxLength={1000} rows={2} /></div>
        </ActionDialog>
      ) : null}

      {dlg === "offer" ? (
        <ActionDialog open onClose={close} onMoment={openMoment} title="Record offer or demand" action={addOfferAction.bind(null, matterId)} submit="Record">
          <div className="grid-2">
            <div className="field"><label className="label" htmlFor="of-dir">Type</label>
              <select id="of-dir" name="direction" className="select" defaultValue="defense_offer"><option value="defense_offer">Defense offer</option><option value="plaintiff_demand">Plaintiff demand</option></select>
            </div>
            <div className="field"><label className="label" htmlFor="of-date">Date</label><input id="of-date" name="offeredOn" type="date" className="input" required defaultValue={today()} max={today()} /></div>
          </div>
          <div className="field"><label className="label" htmlFor="of-amt">Amount (USD)</label><input id="of-amt" name="amount" className="input" inputMode="decimal" required placeholder="250,000" /></div>
          <div className="field"><label className="label" htmlFor="of-notes">Notes (optional)</label><input id="of-notes" name="notes" className="input" maxLength={500} /></div>
        </ActionDialog>
      ) : null}

      {dlg === "financials" ? (
        <ActionDialog open onClose={close} onMoment={openMoment} title="Update financials" sub="Changes are recorded in the provenance log with the previous value." action={updateFinancialsAction.bind(null, matterId)} submit="Save">
          <div className="grid-2">
            <div className="field"><label className="label" htmlFor="fi-exp">Litigation expenses to date (USD)</label><input id="fi-exp" name="expensesToDate" className="input" inputMode="decimal" defaultValue={money(financials.expensesToDate)} /></div>
            <div className="field"><label className="label" htmlFor="fi-hrs">Attorney hours to date</label><input id="fi-hrs" name="attorneyHours" className="input" inputMode="decimal" defaultValue={financials.attorneyHours ?? ""} /></div>
          </div>
        </ActionDialog>
      ) : null}

      {dlg === "outcome" ? <OutcomeDialog matterId={matterId} onClose={close} correcting={!isOpen} /> : null}
    </>
  );
}

function PredictionDialog({ matterId, prev, sandbox, onClose }: { matterId: string; prev: PrevPrediction; sandbox: boolean; onClose: () => void }) {
  const [prob, setProb] = useState(prev ? Math.round(prev.probability * 100) : 60);
  const [drivers, setDrivers] = useState<string[]>(prev?.drivers ?? []);
  const [conf, setConf] = useState(prev?.confidence ?? "medium");
  const toggle = (k: string) => setDrivers((d) => (d.includes(k) ? d.filter((x) => x !== k) : d.length >= 3 ? d : [...d, k]));
  return (
    <ActionDialog open onClose={onClose} wide action={recordPredictionAction.bind(null, matterId)} submit={prev ? `Record revision v${prev.version + 1}` : "Record prediction"}
      title={prev ? `Revise prediction (v${prev.version + 1})` : "Record prediction"}
      sub={sandbox ? "Sandbox: this demonstration prediction is visible only in the demo workspace and is removed at the daily reset." : "Once recorded, a prediction cannot be edited or deleted. A later revision is saved as a new version."}>
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="pr-low">Expected recovery, low (USD)</label><input id="pr-low" name="recoveryLow" className="input" inputMode="decimal" required defaultValue={money(prev?.recoveryLow)} placeholder="300,000" autoFocus /></div>
        <div className="field"><label className="label" htmlFor="pr-high">Expected recovery, high (USD)</label><input id="pr-high" name="recoveryHigh" className="input" inputMode="decimal" required defaultValue={money(prev?.recoveryHigh)} placeholder="450,000" /></div>
      </div>
      <div className="field">
        <label className="label" htmlFor="pr-prob">Probability of a favorable resolution: <span className="num" style={{ color: "var(--ink)" }}>{prob}%</span></label>
        <input id="pr-prob" name="probability" type="range" min={1} max={99} value={prob} onChange={(e) => setProb(Number(e.target.value))} className="range" aria-valuetext={`${prob} percent`} />
        <span className="help">Favorable means a settlement, judgment or award with a recovery for the client.</span>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="pr-dur">Expected total duration (months from opening)</label><input id="pr-dur" name="expectedDurationMonths" className="input" inputMode="decimal" required defaultValue={prev?.expectedDurationMonths ?? ""} placeholder="16" /></div>
        <div className="field"><label className="label" htmlFor="pr-exp">Expected total litigation expense (USD)</label><input id="pr-exp" name="expectedExpense" className="input" inputMode="decimal" required defaultValue={money(prev?.expectedExpense)} placeholder="45,000" /></div>
      </div>
      <div className="field">
        <span className="label" id="pr-conf-l">Confidence in this estimate</span>
        <div className="seg" role="radiogroup" aria-labelledby="pr-conf-l">
          {(["low", "medium", "high"] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={conf === c} aria-pressed={conf === c} onClick={() => setConf(c)}>{c[0]!.toUpperCase() + c.slice(1)}</button>
          ))}
        </div>
        <input type="hidden" name="confidence" value={conf} />
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Key drivers <span className="muted">(up to 3)</span></legend>
        <div className="row-wrap" style={{ gap: 6 }}>
          {DRIVERS.map((d) => {
            const on = drivers.includes(d.key);
            return (
              <button key={d.key} type="button" className={`badge ${on ? "badge-accent" : "badge-outline"}`} aria-pressed={on} onClick={() => toggle(d.key)}
                style={{ cursor: "pointer", height: 26, opacity: !on && drivers.length >= 3 ? 0.5 : 1 }} disabled={!on && drivers.length >= 3}>
                {on ? "✓ " : ""}{d.label}
              </button>
            );
          })}
        </div>
        {drivers.map((d) => <input key={d} type="hidden" name="drivers" value={d} />)}
      </fieldset>
      {prev ? (
        <div className="field"><label className="label" htmlFor="pr-reason">What new information prompted this revision?</label><textarea id="pr-reason" name="revisionReason" className="textarea" required maxLength={500} rows={2} placeholder="Discovery completed; key witness deposition favorable." /></div>
      ) : null}
    </ActionDialog>
  );
}

function OutcomeDialog({ matterId, onClose, correcting }: { matterId: string; onClose: () => void; correcting: boolean }) {
  const [res, setRes] = useState("settlement");
  const favorable = RESOLUTIONS.find((r) => r.key === res)?.favorable;
  return (
    <ActionDialog open onClose={onClose} wide action={recordOutcomeAction.bind(null, matterId)} submit={correcting ? "Save correction" : "Record outcome and close matter"}
      title={correcting ? "Correct outcome" : "Record outcome"} sub={correcting ? "The previous values are kept in the provenance log." : "Recording an outcome closes the matter. Predictions can no longer be added."}>
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="oc-res">Resolution</label>
          <select id="oc-res" name="resolutionType" className="select" value={res} onChange={(e) => setRes(e.target.value)}>{RESOLUTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
        </div>
        <div className="field"><label className="label" htmlFor="oc-date">Resolved on</label><input id="oc-date" name="resolvedOn" type="date" className="input" required defaultValue={today()} max={today()} /></div>
      </div>
      <p className="help">Financial terms: gross recovery is the total paid by the defendant; attorney fee is the firm&apos;s contingency fee before any referral split; referral fee is the portion paid to a referring attorney; litigation expenses are case costs the firm advanced.</p>
      <div className="grid-3">
        <div className="field"><label className="label" htmlFor="oc-gross">Gross recovery</label><input id="oc-gross" name="grossRecovery" className="input" inputMode="decimal" placeholder={favorable ? "475,000" : "0"} /></div>
        <div className="field"><label className="label" htmlFor="oc-fee">Attorney fee</label><input id="oc-fee" name="attorneyFee" className="input" inputMode="decimal" /></div>
        <div className="field"><label className="label" htmlFor="oc-ref">Referral fee paid</label><input id="oc-ref" name="referralFeePaid" className="input" inputMode="decimal" /></div>
        <div className="field"><label className="label" htmlFor="oc-exp">Litigation expenses</label><input id="oc-exp" name="litigationExpenses" className="input" inputMode="decimal" /></div>
        <div className="field"><label className="label" htmlFor="oc-net">Net to client</label><input id="oc-net" name="netToClient" className="input" inputMode="decimal" /></div>
        <div className="field"><label className="label" htmlFor="oc-hrs">Attorney hours</label><input id="oc-hrs" name="attorneyHours" className="input" inputMode="decimal" /></div>
      </div>
      <div className="field"><label className="label" htmlFor="oc-notes">Notes (optional)</label><textarea id="oc-notes" name="notes" className="textarea" rows={2} maxLength={2000} /></div>
    </ActionDialog>
  );
}

export type ProvRow = { id: string; field: string; originalValue: string | null; normalizedValue: string | null; source: string; confidence: number | null; method: string | null; reviewerName: string | null; createdAt: string; entityType: string };

const SOURCE_LABEL: Record<string, string> = { import: "Imported", attorney_entered: "Entered by attorney", manually_corrected: "Manually corrected", derived: "Derived", extracted: "Extracted", demo_seed: "Synthetic demo data" };

export function ProvenanceButton({ rows, importName }: { rows: ProvRow[]; importName: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="method-link" onClick={() => setOpen(true)}><Icon name="file" size={13} /> Data provenance</button>
      <Dialog open={open} onClose={() => setOpen(false)} variant="drawer" title="Data provenance" sub="Where each value on this matter came from">
        {importName ? <div className="alert alert-info" style={{ marginBottom: 14 }}><span>Imported from <strong>{importName}</strong>.</span></div> : null}
        {rows.length ? (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map((r) => (
              <li key={r.id} style={{ padding: "11px 0", borderBottom: "1px solid var(--line-soft)" }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong style={{ fontWeight: 550, fontSize: 13 }}>{r.entityType === "outcome" ? "Outcome · " : ""}{r.field.replace(/_/g, " ")}</strong>
                  <span className="badge">{SOURCE_LABEL[r.source] ?? r.source}</span>
                </div>
                <div className="help" style={{ marginTop: 4 }}>
                  {r.originalValue != null ? <>Original: <span className="mono">{r.originalValue}</span>{r.normalizedValue != null && r.normalizedValue !== r.originalValue ? <> → <span className="mono">{r.normalizedValue}</span></> : null}</> : r.normalizedValue != null ? <>Value: <span className="mono">{r.normalizedValue}</span></> : null}
                </div>
                <div className="help">
                  {r.method ? `Method: ${r.method}` : ""}{r.confidence != null ? ` · Confidence ${Math.round(r.confidence * 100)}%` : ""}{r.reviewerName ? ` · Reviewed by ${r.reviewerName}` : ""} · {r.createdAt.slice(0, 10)}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="muted">All values on this matter were entered directly in Asteric.</p>}
      </Dialog>
    </>
  );
}

const DECISIONS = [
  ["continue_investment", "Continue investment"], ["approve_expense", "Approve major expense"], ["offer_response", "Offer response"],
  ["second_review", "Second review completed"], ["accept", "Accept matter"], ["reject", "Reject matter"], ["refer", "Refer out"], ["other", "Other internal decision"],
] as const;

function DecisionDialog({ matterId, events, second, itemKey, onClose }: { matterId: string; events: { id: string; label: string }[]; second: boolean; itemKey: string | null; onClose: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<string>(second ? "second_review" : "continue_investment");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [eventId, setEventId] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title={second ? "Record second review" : "Record firm decision"} sub="Recorded in the decision ledger with the latest assessment. Asteric records the decision; it does not recommend one.">
      <div className="stack">
        <div className="field"><label className="label" htmlFor="dc-type">Decision</label>
          <select id="dc-type" className="select" value={type} onChange={(e) => setType(e.target.value)}>{DECISIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        {type === "approve_expense" || type === "continue_investment" ? <div className="field"><label className="label" htmlFor="dc-amt">Capital committed (optional)</label><input id="dc-amt" className="input" inputMode="decimal" placeholder="25,000" value={amount} onChange={(e) => setAmount(e.target.value)} /></div> : null}
        {events.length ? <div className="field"><label className="label" htmlFor="dc-ev">Linked event (optional)</label><select id="dc-ev" className="select" value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">None</option>{events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select></div> : null}
        <div className="field"><label className="label" htmlFor="dc-reason">{second ? "Review notes" : "Reason (optional)"}</label><textarea id="dc-reason" className="textarea" rows={2} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={second ? "Reviewed the assessment and supporting facts with the lead attorney." : ""} /></div>
        {msg.error ? <div className="alert alert-error" role="alert">{msg.error}</div> : msg.ok ? <div className="alert alert-success">{msg.ok}</div> : null}
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={pending || Boolean(msg.ok)} onClick={() => start(async () => {
            const n = Number(amount.replace(/[$,\s]/g, ""));
            const r = await recordDecisionAction(matterId, { type, reason: reason || undefined, capitalAmount: amount && Number.isFinite(n) ? n : null, eventId: eventId || null, itemKey: type === "second_review" ? itemKey : null });
            setMsg(r); if (!r.error) { router.refresh(); setTimeout(onClose, 900); }
          })}>{pending ? "Saving…" : "Record decision"}</button>
        </div>
      </div>
    </Dialog>
  );
}

function DevelopmentDialog({ matterId, onClose, onMoment }: { matterId: string; onClose: () => void; onMoment: (id: string) => void }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onClose={onClose} title="Mark a material development" sub="Opens a Decision Moment on this matter so the assessment can be reconfirmed.">
      <div className="stack">
        <div className="field"><label className="label" htmlFor="md-note">What happened?</label><input id="md-note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Key witness unavailable for trial" autoFocus /></div>
        {err ? <div className="alert alert-error">{err}</div> : null}
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={pending || !note.trim()} onClick={() => start(async () => { const r = await markDevelopmentAction(matterId, note); if (r.error) setErr(r.error); else onMoment(r.data!.momentId as string); })}>Continue</button>
        </div>
      </div>
    </Dialog>
  );
}
