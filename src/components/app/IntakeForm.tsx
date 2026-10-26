"use client";

import { useActionState } from "react";
import { recordIntakeAction } from "@/app/app/workflow-actions";
import type { ActionResult } from "@/server/action-runner";
import { FormMessage, SubmitButton } from "@/components/ui/Form";
import { LIKELIHOOD } from "@/lib/assessment";

type Opt = { key: string; label: string };
export function IntakeForm({ categories, referrals, attorneys, reasons, defaultAttorney }: { categories: Opt[]; referrals: Opt[]; attorneys: Opt[]; reasons: Opt[]; defaultAttorney: string | null }) {
  const [state, action] = useActionState(recordIntakeAction, {} as ActionResult);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="stack" key={state.ok ? Date.now() : "f"}>
      <div className="seg" role="radiogroup" aria-label="Decision">
        <label className="check" style={{ padding: "6px 12px" }}><input type="radio" name="disposition" value="rejected" defaultChecked /> Declined</label>
        <label className="check" style={{ padding: "6px 12px" }}><input type="radio" name="disposition" value="referred" /> Referred out</label>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="in-date">Intake date</label><input id="in-date" name="receivedOn" type="date" className="input" defaultValue={today} max={today} required /></div>
        <div className="field"><label className="label" htmlFor="in-reason">Reason</label><select id="in-reason" name="reasonCode" className="select" required>{reasons.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></div>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="in-cat">Category</label><select id="in-cat" name="categoryKey" className="select" defaultValue=""><option value="">Select</option>{categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
        <div className="field"><label className="label" htmlFor="in-ref">Referral source</label><select id="in-ref" name="referralId" className="select" defaultValue=""><option value="">None</option>{referrals.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="in-att">Responsible attorney</label><select id="in-att" name="attorneyId" className="select" defaultValue={defaultAttorney ?? ""}><option value="">Select</option>{attorneys.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
        <div className="field"><label className="label" htmlFor="in-lk">Likelihood at intake (optional)</label><select id="in-lk" name="likelihood" className="select" defaultValue=""><option value="">Not assessed</option>{LIKELIHOOD.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select></div>
      </div>
      <div className="field"><label className="label" htmlFor="in-label">Short label (optional)</label><input id="in-label" name="label" className="input" maxLength={160} placeholder="Do not include client names" /></div>
      <FormMessage state={state} />
      <div className="row" style={{ justifyContent: "flex-end" }}><SubmitButton pendingLabel="Saving…">Record intake decision</SubmitButton></div>
    </form>
  );
}
