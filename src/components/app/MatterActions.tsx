"use client";

import { useActionState, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { FormMessage, SubmitButton } from "@/components/ui/Form";
import { Icon } from "@/components/ui/Icon";
import {
  addEventAction, addOfferAction, recordOutcomeAction, recordPredictionAction, updateFinancialsAction, type ActionResult,
} from "@/app/app/actions";
import { DRIVERS, EVENT_TYPES, RESOLUTIONS } from "@/lib/taxonomy";

type Bound = (s: ActionResult, fd: FormData) => Promise<ActionResult>;

function ActionDialog({ open, onClose, title, sub, action, submit, children, wide }: {
  open: boolean; onClose: () => void; title: string; sub?: React.ReactNode; action: Bound; submit: string; children: React.ReactNode; wide?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  useEffect(() => {
    if (!state.ok) return;
    const t = setTimeout(onClose, 1100);
    return () => clearTimeout(t);
  }, [state, onClose]);
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

export type MatterPermissions = { predict: boolean; sandbox: boolean; events: boolean; outcome: boolean; edit: boolean };

export function MatterActions({ matterId, open: isOpen, prev, perms, financials }: {
  matterId: string; open: boolean; prev: PrevPrediction; perms: MatterPermissions; financials: { expensesToDate: number | null; attorneyHours: number | null };
}) {
  const [dlg, setDlg] = useState<null | "predict" | "event" | "offer" | "outcome" | "financials">(null);
  const close = () => setDlg(null);
  const canPredict = isOpen && (perms.predict || perms.sandbox);
  return (
    <>
      <div className="row-wrap" style={{ gap: 8 }}>
        {canPredict ? (
          <button type="button" className="btn btn-primary" onClick={() => setDlg("predict")}>
            <Icon name="plus" size={14} /> {prev ? "Revise prediction" : "Record prediction"}
          </button>
        ) : null}
        {perms.events ? <button type="button" className="btn btn-secondary" onClick={() => setDlg("event")}>Add event</button> : null}
        {perms.events ? <button type="button" className="btn btn-secondary" onClick={() => setDlg("offer")}>Add offer</button> : null}
        {perms.edit && isOpen ? <button type="button" className="btn btn-secondary" onClick={() => setDlg("financials")}>Update financials</button> : null}
        {perms.outcome ? <button type="button" className="btn btn-secondary" onClick={() => setDlg("outcome")}>{isOpen ? "Record outcome" : "Correct outcome"}</button> : null}
      </div>

      {dlg === "predict" ? <PredictionDialog matterId={matterId} prev={prev} sandbox={perms.sandbox && !perms.predict} onClose={close} /> : null}

      {dlg === "event" ? (
        <ActionDialog open onClose={close} title="Add procedural event" action={addEventAction.bind(null, matterId)} submit="Add event">
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
        <ActionDialog open onClose={close} title="Record offer or demand" action={addOfferAction.bind(null, matterId)} submit="Record">
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
        <ActionDialog open onClose={close} title="Update financials" sub="Changes are recorded in the provenance log with the previous value." action={updateFinancialsAction.bind(null, matterId)} submit="Save">
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
