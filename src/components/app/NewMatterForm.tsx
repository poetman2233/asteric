"use client";

import { useActionState } from "react";
import { createMatterAction, type ActionResult } from "@/app/app/actions";
import { FormMessage, SubmitButton } from "@/components/ui/Form";
import { PROCEDURAL_STAGES } from "@/lib/taxonomy";

export function NewMatterForm({ categories, attorneys, referrals, defaultAttorney }: { categories: { key: string; label: string }[]; attorneys: { id: string; name: string }[]; referrals: string[]; defaultAttorney: string | null }) {
  const [state, action] = useActionState(createMatterAction, {} as ActionResult);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="stack">
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="nm-name">Matter name</label><input id="nm-name" name="name" className="input" required placeholder="Client v. Employer" autoFocus /></div>
        <div className="field"><label className="label" htmlFor="nm-id">Matter ID (optional)</label><input id="nm-id" name="externalId" className="input" placeholder="As in your case management system" /></div>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="nm-cat">Category</label><select id="nm-cat" name="categoryKey" className="select" defaultValue=""><option value="">Select</option>{categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
        <div className="field"><label className="label" htmlFor="nm-att">Lead attorney</label><select id="nm-att" name="leadAttorneyId" className="select" defaultValue={defaultAttorney ?? ""}><option value="">Select</option>{attorneys.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="nm-ref">Referral source</label><input id="nm-ref" name="referralName" className="input" list="nm-refs" placeholder="Choose or type a new source" /><datalist id="nm-refs">{referrals.map((r) => <option key={r} value={r} />)}</datalist></div>
        <div className="field"><label className="label" htmlFor="nm-open">Date opened</label><input id="nm-open" name="openedOn" type="date" className="input" required defaultValue={today} max={today} /></div>
      </div>
      <div className="grid-3">
        <div className="field"><label className="label" htmlFor="nm-jur">Jurisdiction</label><input id="nm-jur" name="jurisdiction" className="input" placeholder="CA" /></div>
        <div className="field"><label className="label" htmlFor="nm-court">Court or forum</label><input id="nm-court" name="court" className="input" /></div>
        <div className="field"><label className="label" htmlFor="nm-stage">Stage</label><select id="nm-stage" name="proceduralStage" className="select" defaultValue="Intake">{PROCEDURAL_STAGES.filter((s) => s !== "Resolved").map((s) => <option key={s}>{s}</option>)}</select></div>
      </div>
      <p className="help">Do not enter client contact details or privileged notes. Asteric needs only what is required to measure outcomes.</p>
      <FormMessage state={state} />
      <div className="row" style={{ justifyContent: "flex-end" }}><SubmitButton pendingLabel="Adding…">Add matter</SubmitButton></div>
    </form>
  );
}
