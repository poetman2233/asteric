"use client";

import { useActionState, useState, useTransition } from "react";
import { completeOnboardingAction, saveOnboardingAction, type ActionResult } from "@/app/app/actions";
import { FormMessage, SubmitButton } from "@/components/ui/Form";
import { CASE_MANAGEMENT_SYSTEMS, PRACTICE_AREAS } from "@/lib/taxonomy";

const SIZES = ["1–5", "6–10", "11–25", "26–50", "50+"];
const VOLUMES = ["Under 100", "100–500", "500–1,000", "1,000–5,000", "5,000+"];

export function Onboarding({ userName, org, demoAvailable }: { userName: string; org: { name: string; practiceArea: string | null } | null; demoAvailable: boolean }) {
  const [step, setStep] = useState(0);
  const [state, action] = useActionState(async (s: ActionResult, fd: FormData) => {
    const r = await saveOnboardingAction(s, fd);
    if (r.ok) setStep(1);
    return r;
  }, {});
  const [pending, start] = useTransition();
  return (
    <div>
      <div className="steps" aria-hidden="true"><span className="step" data-done="true" /><span className="step" data-done={step >= 1} /></div>
      {step === 0 ? (
        <>
          <h1 className="display" style={{ fontSize: 40 }}>Welcome, {userName.split(" ")[0]}.</h1>
          <p className="page-sub" style={{ marginTop: 8, marginBottom: 26 }}>Tell us about your firm. This sets up categories and defaults; you can change everything later.</p>
          <form action={action} className="stack">
            <div className="field"><label className="label" htmlFor="ob-name">Organization name</label><input id="ob-name" name="name" className="input" required minLength={2} maxLength={160} defaultValue={org?.name ?? ""} autoFocus /></div>
            <div className="field"><label className="label" htmlFor="ob-pa">Primary practice area</label>
              <select id="ob-pa" name="practiceArea" className="select" defaultValue={org?.practiceArea ?? "employment"}>{PRACTICE_AREAS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
            </div>
            <div className="grid-2">
              <div className="field"><label className="label" htmlFor="ob-att">Attorneys</label><select id="ob-att" name="attorneyCount" className="select" defaultValue=""><option value="">Select</option>{SIZES.map((x) => <option key={x}>{x}</option>)}</select></div>
              <div className="field"><label className="label" htmlFor="ob-vol">Matters per year</label><select id="ob-vol" name="matterVolume" className="select" defaultValue=""><option value="">Select</option>{VOLUMES.map((x) => <option key={x}>{x}</option>)}</select></div>
            </div>
            <div className="grid-2">
              <div className="field"><label className="label" htmlFor="ob-cms">Case management system</label><select id="ob-cms" name="caseManagementSystem" className="select" defaultValue=""><option value="">Select</option>{CASE_MANAGEMENT_SYSTEMS.map((x) => <option key={x}>{x}</option>)}</select></div>
              <div className="field"><label className="label" htmlFor="ob-title">Your title</label><input id="ob-title" name="userTitle" className="input" maxLength={80} placeholder="Managing Partner" /></div>
            </div>
            <FormMessage state={state.error ? state : undefined} />
            <div className="row" style={{ justifyContent: "flex-end" }}><SubmitButton pendingLabel="Saving…">Continue</SubmitButton></div>
          </form>
        </>
      ) : (
        <>
          <h1 className="display" style={{ fontSize: 40 }}>How would you like to start?</h1>
          <p className="page-sub" style={{ marginTop: 8, marginBottom: 26 }}>Your workspace is ready and private to your organization.</p>
          <div className="stack">
            <button type="button" className="choice" disabled={pending} onClick={() => start(() => completeOnboardingAction("import"))}>
              <span className="choice-title">Import historical matters</span>
              <span className="help" style={{ display: "block", marginTop: 4 }}>Upload a CSV or XLSX export. Calibration and economics populate from your closed matters. Recommended.</span>
            </button>
            {demoAvailable ? (
              <button type="button" className="choice" disabled={pending} onClick={() => start(() => completeOnboardingAction("demo"))}>
                <span className="choice-title">Explore the demonstration workspace</span>
                <span className="help" style={{ display: "block", marginTop: 4 }}>A synthetic employment firm with five years of matters. Switch back to your own organization at any time.</span>
              </button>
            ) : null}
            <button type="button" className="choice" disabled={pending} onClick={() => start(() => completeOnboardingAction("workspace"))}>
              <span className="choice-title">Start with an empty workspace</span>
              <span className="help" style={{ display: "block", marginTop: 4 }}>Add matters and record predictions as new matters come in.</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
