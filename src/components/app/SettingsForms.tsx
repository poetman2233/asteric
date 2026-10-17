"use client";

import { Fragment, useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelDeletionAction, changePasswordAction, changeRoleAction, confirmMfaAction, disableMfaAction, inviteMemberAction, removeMemberAction,
  requestDeletionAction, revokeAllOtherSessionsAction, revokeInvitationAction, revokeSessionAction, startMfaAction, updateOrganizationAction, updateProfileAction,
} from "@/app/app/settings/actions";
import type { ActionResult } from "@/server/action-runner";
import { FormMessage, SubmitButton } from "@/components/ui/Form";
import { ROLE_DESCRIPTION, ROLE_LABEL, type Role } from "@/lib/roles";

/* ------------------------------------------------------------------ profile */
export function ProfileForm({ name, title, email, disabled }: { name: string; title: string | null; email: string; disabled: boolean }) {
  const [state, action] = useActionState(updateProfileAction, {} as ActionResult);
  return (
    <form action={action} className="stack">
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="pf-name">Full name</label><input id="pf-name" name="name" className="input" defaultValue={name} required disabled={disabled} /></div>
        <div className="field"><label className="label" htmlFor="pf-title">Title</label><input id="pf-title" name="title" className="input" defaultValue={title ?? ""} disabled={disabled} /></div>
      </div>
      <div className="field"><label className="label" htmlFor="pf-email">Email</label><input id="pf-email" className="input" value={email} disabled readOnly /><span className="help">To change your sign-in email, contact your organization&apos;s owner.</span></div>
      <FormMessage state={state} />
      {!disabled ? <div className="row" style={{ justifyContent: "flex-end" }}><SubmitButton pendingLabel="Saving…">Save profile</SubmitButton></div> : null}
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, {} as ActionResult);
  return (
    <form action={action} className="stack">
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="pw-cur">Current password</label><input id="pw-cur" name="current" type="password" className="input" autoComplete="current-password" required /></div>
        <div className="field"><label className="label" htmlFor="pw-new">New password</label><input id="pw-new" name="next" type="password" className="input" autoComplete="new-password" minLength={12} required /><span className="help">At least 12 characters.</span></div>
      </div>
      <FormMessage state={state} />
      <div className="row" style={{ justifyContent: "flex-end" }}><SubmitButton pendingLabel="Updating…">Change password</SubmitButton></div>
    </form>
  );
}

/* ------------------------------------------------------------------ MFA */
export function MfaPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [enroll, setEnroll] = useState<{ qr: string; secret: string } | null>(null);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirmState, confirm] = useActionState(confirmMfaAction, {} as ActionResult);
  const [disableState, disable] = useActionState(disableMfaAction, {} as ActionResult);
  const codes = confirmState.data?.codes as string[] | undefined;

  if (codes) {
    return (
      <div className="stack">
        <div className="alert alert-success"><span>Two-factor authentication is on. Save these recovery codes somewhere safe. Each works once, and they will not be shown again.</span></div>
        <pre className="mono" style={{ background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: 8, padding: 14, columns: 2, fontSize: 13 }}>{codes.join("\n")}</pre>
        <div className="row" style={{ justifyContent: "flex-end" }}><button type="button" className="btn btn-primary" onClick={() => router.refresh()}>I have saved my codes</button></div>
      </div>
    );
  }
  if (enabled) {
    return (
      <form action={disable} className="stack">
        <p><span className="badge badge-pos">✓ On</span> <span className="ink2">You are asked for a code from your authenticator app when you sign in.</span></p>
        <div className="field" style={{ maxWidth: 320 }}><label className="label" htmlFor="mfa-pw">Password (to turn off)</label><input id="mfa-pw" name="password" type="password" className="input" autoComplete="current-password" required /></div>
        <FormMessage state={disableState} />
        <div><SubmitButton className="btn btn-secondary" pendingLabel="Turning off…">Turn off two-factor authentication</SubmitButton></div>
      </form>
    );
  }
  if (!enroll) {
    return (
      <div className="stack">
        <p className="ink2">Add a second step at sign-in with an authenticator app such as 1Password, Google Authenticator or Microsoft Authenticator. Recommended for every account.</p>
        {startErr ? <div className="alert alert-error">{startErr}</div> : null}
        <div><button type="button" className="btn btn-primary" disabled={pending} onClick={() => start(async () => { const r = await startMfaAction(); if (r.error) setStartErr(r.error); else setEnroll(r.data as { qr: string; secret: string }); })}>Set up two-factor authentication</button></div>
      </div>
    );
  }
  return (
    <form action={confirm} className="stack">
      <div className="row" style={{ gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enroll.qr} alt="QR code for your authenticator app" width={176} height={176} style={{ border: "1px solid var(--line)", borderRadius: 8 }} />
        <div className="stack-sm" style={{ flex: 1, minWidth: 220 }}>
          <p>1. Scan the code with your authenticator app.</p>
          <p className="help">Or enter this key manually: <span className="mono" style={{ wordBreak: "break-all" }}>{enroll.secret}</span></p>
          <p>2. Enter the 6-digit code it shows.</p>
          <div className="field" style={{ maxWidth: 200 }}><label className="label sr-only" htmlFor="mfa-code">Code</label><input id="mfa-code" name="code" className="input mono" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required placeholder="123456" /></div>
        </div>
      </div>
      <FormMessage state={confirmState} />
      <div><SubmitButton pendingLabel="Verifying…">Verify and turn on</SubmitButton></div>
    </form>
  );
}

export function SessionRow({ id, current, label, sub }: { id: string; current: boolean; label: string; sub: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <tr>
      <td><div className="cell-primary">{label}</div><span className="cell-sub">{sub}</span></td>
      <td className="r">{current ? <span className="badge badge-accent">This session</span> : <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await revokeSessionAction(id); router.refresh(); })}>Sign out</button>}</td>
    </tr>
  );
}

export function RevokeOthersButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await revokeAllOtherSessionsAction(); router.refresh(); })}>Sign out all other sessions</button>;
}

/* ------------------------------------------------------------------ organization */
export type OrgFormValues = {
  name: string; timezone: string; attorneyHourlyCost: number | null; defaultContingencyRate: number | null; expensesReimbursedFromRecovery: boolean;
  staleDays: number; expenseVarianceThreshold: number; analystsSeePredictionAuthors: boolean; aiAssistEnabled: boolean;
};

export function OrganizationForm({ v, editable, aiConfigured }: { v: OrgFormValues; editable: boolean; aiConfigured: boolean }) {
  const [state, action] = useActionState(updateOrganizationAction, {} as ActionResult);
  // Fixed list so server and client render identically.
  const zones = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "America/Puerto_Rico", "UTC"];
  return (
    <form action={action} className="stack-lg">
      <fieldset disabled={!editable} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="grid-2">
          <div className="field"><label className="label" htmlFor="org-name">Organization name</label><input id="org-name" name="name" className="input" defaultValue={v.name} required /></div>
          <div className="field"><label className="label" htmlFor="org-tz">Time zone</label>
            <select id="org-tz" name="timezone" className="select" defaultValue={v.timezone}>{[...new Set([v.timezone, ...zones])].map((z) => <option key={z}>{z}</option>)}</select>
          </div>
        </div>
        <h3 className="section-title" style={{ marginTop: 8 }}>Economics assumptions</h3>
        <div className="grid-2">
          <div className="field"><label className="label" htmlFor="org-hc">Attorney hourly cost (USD)</label><input id="org-hc" name="attorneyHourlyCost" className="input" inputMode="decimal" defaultValue={v.attorneyHourlyCost ?? ""} placeholder="Not set" /><span className="help">Internal fully loaded cost per attorney hour. Enables fully costed ROLC. Leave blank to show expense-only.</span></div>
          <div className="field"><label className="label" htmlFor="org-cr">Default contingency rate (%)</label><input id="org-cr" name="defaultContingencyRate" className="input" inputMode="decimal" defaultValue={v.defaultContingencyRate != null ? Math.round(v.defaultContingencyRate * 1000) / 10 : ""} placeholder="Not set" /><span className="help">Used only where a favorable outcome has no recorded fee. Such fees are labeled derived.</span></div>
        </div>
        <label className="check"><input type="checkbox" name="expensesReimbursedFromRecovery" defaultChecked={v.expensesReimbursedFromRecovery} /> Litigation expenses are reimbursed to the firm from a favorable recovery</label>
        <h3 className="section-title" style={{ marginTop: 8 }}>Portfolio Watch</h3>
        <div className="grid-2">
          <div className="field"><label className="label" htmlFor="org-sd">Flag predictions older than (days)</label><input id="org-sd" name="staleDays" className="input" inputMode="numeric" defaultValue={v.staleDays} /></div>
          <div className="field"><label className="label" htmlFor="org-ev">Flag expense overruns above (%)</label><input id="org-ev" name="expenseVarianceThreshold" className="input" inputMode="decimal" defaultValue={Math.round(v.expenseVarianceThreshold * 100)} /></div>
        </div>
        <h3 className="section-title" style={{ marginTop: 8 }}>Privacy</h3>
        <label className="check"><input type="checkbox" name="analystsSeePredictionAuthors" defaultChecked={v.analystsSeePredictionAuthors} /> Analysts can see which attorney recorded each prediction</label>
        <label className="check" style={{ alignItems: "flex-start" }}>
          <input type="checkbox" name="aiAssistEnabled" defaultChecked={v.aiAssistEnabled} disabled={!aiConfigured && !v.aiAssistEnabled} style={{ marginTop: 3 }} />
          <span>Allow AI-assisted column mapping during imports<span className="help" style={{ display: "block" }}>{aiConfigured ? "Only column headers and inferred value types are sent to the AI provider, never cell contents. Suggestions always require confirmation." : "No AI provider is configured on this deployment."}</span></span>
        </label>
      </fieldset>
      <FormMessage state={state} />
      {editable ? <div className="row" style={{ justifyContent: "flex-end" }}><SubmitButton pendingLabel="Saving…">Save settings</SubmitButton></div> : <p className="help">Only owners and administrators can change organization settings.</p>}
    </form>
  );
}

/* ------------------------------------------------------------------ team */
export function InviteForm({ roles }: { roles: Role[] }) {
  const [state, action] = useActionState(inviteMemberAction, {} as ActionResult);
  const link = state.data?.link as string | undefined;
  return (
    <form action={action} className="stack">
      <div className="row-wrap" style={{ gap: 10, alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "1 1 260px" }}><label className="label" htmlFor="inv-email">Email</label><input id="inv-email" name="email" type="email" className="input" required placeholder="name@yourfirm.com" /></div>
        <div className="field" style={{ flex: "0 1 200px" }}><label className="label" htmlFor="inv-role">Role</label>
          <select id="inv-role" name="role" className="select" defaultValue={roles.includes("attorney") ? "attorney" : roles[0]}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
        </div>
        <SubmitButton pendingLabel="Inviting…">Send invitation</SubmitButton>
      </div>
      <FormMessage state={state} />
      {link ? <input className="input mono" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invitation link" /> : null}
      <details><summary className="help" style={{ cursor: "pointer" }}>What each role can do</summary>
        <dl className="dl" style={{ marginTop: 10 }}>{roles.map((r) => <Fragment key={r}><dt>{ROLE_LABEL[r]}</dt><dd>{ROLE_DESCRIPTION[r]}</dd></Fragment>)}</dl>
      </details>
    </form>
  );
}

export function MemberControls({ membershipId, role, roles, self }: { membershipId: string; role: Role; roles: Role[]; self: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  if (self || !roles.length) return <span className="ink2">{ROLE_LABEL[role]}</span>;
  return (
    <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
      <select className="select" style={{ height: 30 }} aria-label="Role" value={role} disabled={pending || (role === "owner" && !roles.includes("owner"))}
        onChange={(e) => start(async () => { const r = await changeRoleAction(membershipId, e.target.value as Role); setMsg(r.error ?? null); router.refresh(); })}>
        {[...new Set([role, ...roles])].map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </select>
      {confirm ? (
        <>
          <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => start(async () => { const r = await removeMemberAction(membershipId); setMsg(r.error ?? null); setConfirm(false); router.refresh(); })}>Remove</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>Keep</button>
        </>
      ) : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(true)}>Remove</button>}
      {msg ? <span className="field-error" role="alert">{msg}</span> : null}
    </div>
  );
}

export function RevokeInviteButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await revokeInvitationAction(id); router.refresh(); })}>Revoke</button>;
}

/* ------------------------------------------------------------------ deletion */
export function DeleteOrgForm({ orgName, scheduledFor }: { orgName: string; scheduledFor: string | null }) {
  const router = useRouter();
  const [state, action] = useActionState(requestDeletionAction, {} as ActionResult);
  const [pending, start] = useTransition();
  if (scheduledFor || state.ok) {
    return (
      <div className="stack">
        <div className="alert alert-error"><span><strong>Deletion scheduled.</strong> {orgName} and all of its data will be permanently deleted {scheduledFor ? `on ${scheduledFor}` : "in 30 days"}. Export anything you need before then.</span></div>
        <div><button type="button" className="btn btn-secondary" disabled={pending} onClick={() => start(async () => { await cancelDeletionAction(); router.refresh(); })}>Cancel deletion</button></div>
      </div>
    );
  }
  return (
    <form action={action} className="stack">
      <p className="ink2">Permanently deletes every matter, prediction, outcome, import file and audit record for this organization after a 30-day grace period, during which an owner can cancel. This cannot be undone afterwards.</p>
      <div className="grid-2">
        <div className="field"><label className="label" htmlFor="del-name">Type <strong>{orgName}</strong> to confirm</label><input id="del-name" name="confirm" className="input" required autoComplete="off" /></div>
        <div className="field"><label className="label" htmlFor="del-pw">Your password</label><input id="del-pw" name="password" type="password" className="input" required autoComplete="current-password" /></div>
      </div>
      <FormMessage state={state} />
      <div><SubmitButton className="btn btn-danger" pendingLabel="Scheduling…">Schedule deletion</SubmitButton></div>
    </form>
  );
}
