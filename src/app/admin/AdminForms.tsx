"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelOrgDeletionAction, provisionOrgAction, regenerateDemoAction, setRequestStatusAction } from "./actions";
import type { ActionResult } from "@/server/action-runner";
import { FormMessage, SubmitButton } from "@/components/ui/Form";
import { PRACTICE_AREAS } from "@/lib/taxonomy";

export function ProvisionForm({ firm = "", email = "", requestId, compact }: { firm?: string; email?: string; requestId?: string; compact?: boolean }) {
  const [state, action] = useActionState(provisionOrgAction, {} as ActionResult);
  const link = state.data?.link as string | undefined;
  return (
    <form action={action} className="stack-sm">
      {requestId ? <input type="hidden" name="requestId" value={requestId} /> : null}
      <div className="row-wrap" style={{ gap: 8, alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "1 1 200px" }}>{compact ? null : <label className="label" htmlFor={`pv-f-${requestId ?? "n"}`}>Firm name</label>}<input id={`pv-f-${requestId ?? "n"}`} name="firm" className="input input-sm" defaultValue={firm} required aria-label="Firm name" /></div>
        <div className="field" style={{ flex: "1 1 220px" }}>{compact ? null : <label className="label" htmlFor={`pv-e-${requestId ?? "n"}`}>Owner email</label>}<input id={`pv-e-${requestId ?? "n"}`} name="ownerEmail" type="email" className="input input-sm" defaultValue={email} required aria-label="Owner email" /></div>
        <select name="practiceArea" className="select" style={{ height: 32 }} aria-label="Practice area" defaultValue="employment">{PRACTICE_AREAS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
        <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Creating…">{requestId ? "Approve" : "Create and invite owner"}</SubmitButton>
      </div>
      <FormMessage state={state} />
      {link ? <input className="input mono" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Owner invitation link" /> : null}
    </form>
  );
}

export function DeclineButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await setRequestStatusAction(id, "declined"); router.refresh(); })}>Decline</button>;
}

export function RegenerateDemoButton({ exists }: { exists: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult>({});
  return (
    <div className="stack-sm">
      <div><button type="button" className="btn btn-secondary" disabled={pending} aria-busy={pending} onClick={() => start(async () => { setMsg(await regenerateDemoAction()); router.refresh(); })}>{pending ? "Generating…" : exists ? "Regenerate demo workspace" : "Create demo workspace"}</button></div>
      <FormMessage state={msg} />
    </div>
  );
}

export function CancelDeletionButton({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(true)}>Cancel deletion</button>;
  return <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await cancelOrgDeletionAction(orgId); router.refresh(); })}>Confirm: owner asked to keep it</button>;
}
