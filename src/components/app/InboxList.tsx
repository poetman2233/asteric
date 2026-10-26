"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inboxAction, reaffirmAction } from "@/app/app/workflow-actions";
import type { InboxItem } from "@/lib/inbox";

const DISMISS_REASONS = ["Already reviewed outside Asteric", "Not material to this matter", "Matter is resolving", "Data needs correction", "Other"];

export function InboxList({ items, members, canAct, viewerId }: { items: InboxItem[]; members: { id: string; name: string }[]; canAct: boolean; viewerId: string }) {
  const [filter, setFilter] = useState<"all" | "mine" | "moment" | "drift" | "rule">("all");
  const mine = (it: InboxItem) => it.state?.action === "assigned" && members.find((m) => m.id === viewerId)?.name === it.state.assignedLabel;
  const shown = items.filter((it) => filter === "all" || (filter === "mine" ? mine(it) : filter === "drift" ? it.kind === "expense_drift" || it.kind === "duration_drift" : filter === "moment" ? it.kind === "moment" || it.kind === "stale" || it.kind === "needs_assessment" : it.kind === "rule"));
  const count = (f: typeof filter) => items.filter((it) => f === "all" || (f === "mine" ? mine(it) : f === "drift" ? it.kind === "expense_drift" || it.kind === "duration_drift" : f === "moment" ? it.kind === "moment" || it.kind === "stale" || it.kind === "needs_assessment" : it.kind === "rule")).length;
  return (
    <div>
      <div className="seg" role="group" aria-label="Filter" style={{ marginBottom: 14 }}>
        {([["all", "All"], ["moment", "Developments"], ["drift", "Drift"], ["rule", "Firm rules"], ["mine", "Assigned to me"]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l} <span className="muted num">{count(k)}</span></button>
        ))}
      </div>
      {shown.length ? shown.map((it) => <Item key={it.key} it={it} members={members} canAct={canAct} />) : <div className="empty"><p className="empty-title">Nothing here</p><div className="empty-body">No items match this filter.</div></div>}
    </div>
  );
}

const KIND_LABEL: Record<string, string> = { moment: "Decision moment", expense_drift: "Expense drift", duration_drift: "Duration drift", stale: "Assessment stale", needs_assessment: "Assessment needed", rule: "Firm review rule" };

function Item({ it, members, canAct }: { it: InboxItem; members: { id: string; name: string }[]; canAct: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [panel, setPanel] = useState<null | "assign" | "snooze" | "dismiss">(null);
  const [reason, setReason] = useState(DISMISS_REASONS[0]!);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const href = `/app/matters/${it.matterId}?review=${encodeURIComponent(it.key)}${it.momentId ? `&moment=${it.momentId}` : ""}${it.cta === "begin_review" ? "&second=1" : ""}`;
  const act = (fn: () => Promise<{ error?: string; ok?: string }>) => start(async () => { const r = await fn(); if (r.error) setMsg(r.error); else { setPanel(null); router.refresh(); } });
  const ctaLabel = it.cta === "assess" ? "Record assessment" : it.cta === "begin_review" ? "Begin review" : it.kind === "duration_drift" ? "Review matter" : "Review assessment";
  return (
    <article className="ix" aria-label={`${KIND_LABEL[it.kind]}: ${it.matterName}`}>
      <div className="ix-head">
        <div style={{ minWidth: 0 }}>
          <div className="ix-kind">{KIND_LABEL[it.kind]}{it.ruleName ? ` · ${it.ruleName}` : ""}</div>
          <div className="ix-matter"><Link href={`/app/matters/${it.matterId}`}>{it.matterName}</Link> <span className="help mono">{it.externalId}</span></div>
          <div className="ix-sub">{it.subtitle}{it.attorneyName ? ` · ${it.attorneyName}` : ""}</div>
        </div>
      </div>
      <div className="ix-rows">{it.rows.map((r) => <div key={r.label}><span>{r.label}</span><b>{r.value}</b></div>)}</div>
      <div className="ix-foot">
        <Link className="btn btn-primary btn-sm" href={href}>{ctaLabel}</Link>
        {canAct && it.canConfirm ? <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => act(() => reaffirmAction(it.matterId, { momentId: it.momentId ?? null, itemKey: it.key }))}>Confirm no change</button> : null}
        {canAct ? <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel(panel === "assign" ? null : "assign")}>Assign</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel(panel === "snooze" ? null : "snooze")}>Snooze</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPanel(panel === "dismiss" ? null : "dismiss")}>Dismiss</button>
        </> : null}
        {it.state?.action === "assigned" ? <span className="ix-state">Assigned to {it.state.assignedLabel}</span> : null}
      </div>
      {panel ? (
        <div className="ix-foot" style={{ borderRadius: 0, background: "var(--surface)" }}>
          {panel === "assign" ? (members.length ? members.map((m) => <button key={m.id} type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => act(() => inboxAction({ itemKey: it.key, matterId: it.matterId, action: "assigned", assignedTo: m.id }))}>{m.name}</button>) : <span className="help">No other members yet. Invite colleagues from Settings → Team.</span>) : null}
          {panel === "snooze" ? [7, 14, 30].map((n) => <button key={n} type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => act(() => inboxAction({ itemKey: it.key, matterId: it.matterId, action: "snoozed", snoozeDays: n }))}>{n} days</button>) : null}
          {panel === "dismiss" ? <>
            <select className="select" style={{ height: 30 }} aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>{DISMISS_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
            <input className="input input-sm" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: 220 }} />
            <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => act(() => inboxAction({ itemKey: it.key, matterId: it.matterId, action: "dismissed", reason: note ? `${reason}: ${note}` : reason }))}>Dismiss with reason</button>
          </> : null}
          {msg ? <span className="field-error">{msg}</span> : null}
        </div>
      ) : null}
    </article>
  );
}
