import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageOrgContext } from "@/server/auth/session";
import { getMatterDetail } from "@/server/services/ledger";
import { todayIso } from "@/server/services/portfolio";
import { MatterActions, ProvenanceButton } from "@/components/app/MatterActions";
import { Card, PageHead } from "@/components/ui/Blocks";
import { Icon } from "@/components/ui/Icon";
import { DRIVER_LABEL, EVENT_LABEL, RESOLUTION_LABEL } from "@/lib/taxonomy";
import { monthsBetween } from "@/lib/analytics/stats";
import { date, months, num, pct, range, signedPct, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Matter" };

type Pred = NonNullable<Awaited<ReturnType<typeof getMatterDetail>>>["predictions"][number];

const SOURCE_NOTE: Record<string, string> = {
  prospective: "Recorded before the outcome was known",
  historical: "Historical estimate from imported records",
  sandbox: "Sandbox prediction (demo workspace only)",
};

export default async function MatterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageOrgContext(`/app/matters/${id}`);
  const d = await getMatterDetail(ctx, id);
  if (!d) notFound();
  const { matter: m, outcome } = d;
  const asOf = todayIso();
  const isOpen = m.status === "open";
  const preds = d.predictions;
  const latest = preds[preds.length - 1] ?? null;
  const initial = preds[0] ?? null;
  const expenses = outcome?.litigationExpenses ?? m.expensesToDate;
  const elapsed = m.openedOn ? monthsBetween(m.openedOn, outcome?.resolvedOn ?? asOf) : null;
  const expVar = latest?.expectedExpense && expenses != null ? expenses / latest.expectedExpense - 1 : null;
  const latestOffer = [...d.offers].reverse().find((o) => o.direction === "defense_offer");

  type Item = { key: string; on: string; order: number; kind: "prediction" | "event" | "offer" | "outcome"; node: React.ReactNode };
  const items: Item[] = [];
  preds.forEach((p, i) => items.push({ key: p.id, on: p.recordedAt.toISOString().slice(0, 10), order: 2, kind: "prediction", node: <PredictionCard p={p} prev={preds[i - 1] ?? null} /> }));
  for (const e of d.events) {
    if (e.type === "other" && outcome && e.occurredOn === outcome.resolvedOn) continue;
    items.push({
      key: e.id, on: e.occurredOn, order: 1, kind: "event",
      node: (<><div className="ledger-meta"><span className="num">{date(e.occurredOn)}</span><span>{EVENT_LABEL[e.type] ?? "Event"}</span></div>
        <div className="ledger-title">{e.title}</div>{e.description ? <div className="ledger-text">{e.description}</div> : null}{e.amount ? <div className="ledger-text num">{usd(e.amount)}</div> : null}</>),
    });
  }
  for (const o of d.offers) {
    items.push({
      key: o.id, on: o.offeredOn, order: 1, kind: "offer",
      node: (<><div className="ledger-meta"><span className="num">{date(o.offeredOn)}</span><span>{o.direction === "defense_offer" ? "Defense offer" : "Plaintiff demand"}</span></div>
        <div className="ledger-title num">{usd(o.amount)}</div>{o.notes ? <div className="ledger-text">{o.notes}</div> : null}</>),
    });
  }
  if (outcome) {
    items.push({
      key: outcome.id, on: outcome.resolvedOn, order: 3, kind: "outcome",
      node: (<><div className="ledger-meta"><span className="num">{date(outcome.resolvedOn)}</span><span>Outcome</span></div>
        <div className="ledger-title">{RESOLUTION_LABEL[outcome.resolutionType] ?? outcome.resolutionType}{outcome.favorable && outcome.grossRecovery != null ? <> · <span className="num">{usd(outcome.grossRecovery)}</span></> : " · No recovery"}</div>
        {initial && outcome.favorable && outcome.grossRecovery != null ? (
          <div className="ledger-text">{outcome.grossRecovery >= initial.recoveryLow && outcome.grossRecovery <= initial.recoveryHigh ? "Inside" : outcome.grossRecovery < initial.recoveryLow ? "Below" : "Above"} the initial predicted range of {range(initial.recoveryLow, initial.recoveryHigh)}{latest && latest !== initial ? `; ${outcome.grossRecovery >= latest.recoveryLow && outcome.grossRecovery <= latest.recoveryHigh ? "inside" : "outside"} the latest (${range(latest.recoveryLow, latest.recoveryHigh)})` : ""}.</div>
        ) : null}</>),
    });
  }
  // Newest first; same-day entries keep a stable order (event, then prediction, then outcome).
  items.sort((a, b) => b.on.localeCompare(a.on) || b.order - a.order);

  const perms = {
    predict: ctx.can("predictions.create"), sandbox: ctx.role === "demo" && ctx.org.isDemo,
    events: ctx.can("events.create"), outcome: ctx.can("outcomes.record"), edit: ctx.can("matters.edit"),
  };

  return (
    <>
      <nav aria-label="Breadcrumb" className="help" style={{ marginBottom: 10 }}><Link className="link" href="/app/matters">Matters</Link> / <span className="mono">{m.externalId ?? "—"}</span></nav>
      <PageHead
        title={m.name}
        sub={<>{[d.category?.label ?? m.originalCategory ?? "Uncategorized", d.attorney?.name ?? "No lead attorney", m.court ?? m.jurisdiction].filter(Boolean).join(" · ")}{" · "}{isOpen ? <span className="badge badge-accent">Open · {m.proceduralStage ?? "Stage not set"}</span> : <span className="badge">Closed {date(m.closedOn)}</span>}</>}
      />
      <div style={{ marginBottom: 18 }}>
        <MatterActions matterId={m.id} open={isOpen} perms={perms} financials={{ expensesToDate: m.expensesToDate, attorneyHours: m.attorneyHours }}
          prev={latest ? { version: latest.version, recoveryLow: latest.recoveryLow, recoveryHigh: latest.recoveryHigh, probability: latest.probability, expectedDurationMonths: latest.expectedDurationMonths, expectedExpense: latest.expectedExpense, confidence: latest.confidence, drivers: latest.drivers } : null} />
      </div>

      <div className="summary" style={{ marginBottom: 20 }}>
        <div><div className="s-k">Latest predicted range</div><div className="s-v">{latest ? range(latest.recoveryLow, latest.recoveryHigh) : "No prediction"}</div><div className="s-sub">{latest ? `v${latest.version} · ${pct(latest.probability)} favorable` : isOpen ? "Record one to start measuring" : "—"}</div></div>
        <div><div className="s-k">{isOpen ? "Elapsed" : "Duration"}</div><div className="s-v">{elapsed != null ? months(elapsed) : "—"}</div><div className="s-sub">{latest?.expectedDurationMonths ? `Expected ${months(latest.expectedDurationMonths)}` : "No expected duration"}</div></div>
        <div><div className="s-k">Litigation expenses</div><div className="s-v">{usd(expenses)}</div><div className="s-sub">{latest?.expectedExpense ? <>Expected {usd(latest.expectedExpense)}{expVar != null ? <> · <span className={expVar > 0.25 ? "neg" : "ink2"}>{expVar > 0 ? "▲ " : expVar < 0 ? "▼ " : ""}{signedPct(expVar)}</span></> : null}</> : "No expected expense"}</div></div>
        <div><div className="s-k">Attorney hours</div><div className="s-v">{num(outcome?.attorneyHours ?? m.attorneyHours)}</div><div className="s-sub">{d.referral ? `Referral: ${d.referral.name}` : "No referral source"}</div></div>
        {outcome ? (
          <div><div className="s-k">Outcome</div><div className="s-v">{outcome.favorable ? usd(outcome.grossRecovery) : "No recovery"}</div><div className="s-sub">{RESOLUTION_LABEL[outcome.resolutionType]}{outcome.attorneyFee != null ? ` · Fee ${usd(outcome.attorneyFee)}` : ""}</div></div>
        ) : (
          <div><div className="s-k">Latest defense offer</div><div className="s-v">{latestOffer ? usd(latestOffer.amount) : "None recorded"}</div><div className="s-sub">{latestOffer ? date(latestOffer.offeredOn) : "—"}</div></div>
        )}
      </div>

      <div className="split">
        <Card title="Decision ledger" sub="Predictions are append-only. Every revision is preserved with what prompted it." actions={<ProvenanceButton importName={d.importInfo?.filename ?? null} rows={d.provenance.map((p) => ({ id: p.id, field: p.field, originalValue: p.originalValue, normalizedValue: p.normalizedValue, source: p.source, confidence: p.confidence, method: p.method, reviewerName: p.reviewerName, createdAt: p.createdAt.toISOString(), entityType: p.entityType }))} />}>
          {items.length ? (
            <ol className="ledger" style={{ listStyle: "none", margin: 0 }}>
              {items.map((it) => <li key={it.key} className="ledger-item" data-kind={it.kind}><span className="ledger-dot" aria-hidden="true" />{it.node}</li>)}
            </ol>
          ) : <p className="muted">Nothing recorded on this matter yet.</p>}
        </Card>

        <div className="stack-lg">
          {outcome ? (
            <Card title="Financial outcome">
              <dl className="dl">
                <dt>Gross recovery</dt><dd className="num">{usd(outcome.grossRecovery)}</dd>
                <dt>Attorney fee</dt><dd className="num">{usd(outcome.attorneyFee)}</dd>
                <dt>Referral fee paid</dt><dd className="num">{usd(outcome.referralFeePaid)}</dd>
                <dt>Net fee to firm</dt><dd className="num">{outcome.attorneyFee != null ? usd(outcome.attorneyFee - (outcome.referralFeePaid ?? 0)) : "—"}</dd>
                <dt>Litigation expenses</dt><dd className="num">{usd(outcome.litigationExpenses)}</dd>
                <dt>Net to client</dt><dd className="num">{usd(outcome.netToClient)}</dd>
              </dl>
              <p className="help" style={{ marginTop: 12 }}>Attorney fee is the firm&apos;s contingency fee before any referral split.</p>
            </Card>
          ) : null}
          <Card title="Matter details">
            <dl className="dl">
              <dt>Matter ID</dt><dd className="mono">{m.externalId ?? "—"}</dd>
              <dt>Opened</dt><dd>{date(m.openedOn)}</dd>
              <dt>Category</dt><dd>{d.category?.label ?? "Uncategorized"}{m.originalCategory && m.originalCategory !== d.category?.label ? <span className="help" style={{ display: "block" }}>Source value: {m.originalCategory}</span> : null}</dd>
              <dt>Lead attorney</dt><dd>{d.attorney?.name ?? "—"}</dd>
              <dt>Referral source</dt><dd>{d.referral?.name ?? "—"}</dd>
              <dt>Forum</dt><dd>{m.court ?? "—"}</dd>
              <dt>Defendant</dt><dd>{[m.defendantIndustry, m.defendantSize ? `${m.defendantSize} employees` : null].filter(Boolean).join(" · ") || "—"}</dd>
              <dt>Source</dt><dd>{d.importInfo ? <Link className="link" href={`/app/imports/${d.importInfo.id}`}>{d.importInfo.filename}</Link> : ctx.org.isDemo ? "Synthetic demo data" : "Entered in Asteric"}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

function PredictionCard({ p, prev }: { p: Pred; prev: Pred | null }) {
  const mid = (x: Pred) => (x.recoveryLow + x.recoveryHigh) / 2;
  const dMid = prev ? mid(p) / mid(prev) - 1 : null;
  const dProb = prev ? p.probability - prev.probability : null;
  return (
    <>
      <div className="ledger-meta">
        <span className="num">{date(p.recordedAt)}</span>
        <span>{p.version > 1 ? `Revision v${p.version}` : "Initial prediction"}</span>
        <span>{p.authorLabel}</span>
        {p.proceduralStage ? <span>{p.proceduralStage}</span> : null}
      </div>
      <div className="pred-card">
        <div className="pred-grid">
          <div><div className="pred-k">Recovery range</div><div className="pred-v">{range(p.recoveryLow, p.recoveryHigh)}</div>{dMid != null ? <div className="pred-delta">{dMid > 0 ? "▲" : dMid < 0 ? "▼" : "•"} {signedPct(dMid)} midpoint</div> : null}</div>
          <div><div className="pred-k">Favorable</div><div className="pred-v">{pct(p.probability)}</div>{dProb != null ? <div className="pred-delta">{dProb > 0 ? "▲" : dProb < 0 ? "▼" : "•"} {dProb >= 0 ? "+" : ""}{Math.round(dProb * 100)} pts</div> : null}</div>
          <div><div className="pred-k">Duration</div><div className="pred-v">{p.expectedDurationMonths != null ? months(p.expectedDurationMonths) : "Not recorded"}</div></div>
          <div><div className="pred-k">Expense</div><div className="pred-v">{p.expectedExpense != null ? usd(p.expectedExpense) : "Not recorded"}</div></div>
          <div><div className="pred-k">Confidence</div><div className="pred-v" style={{ textTransform: "capitalize" }}>{p.confidence ?? "Not recorded"}</div></div>
        </div>
        {p.drivers.length ? <div className="drivers">{p.drivers.map((d) => <span key={d} className="badge badge-outline">{DRIVER_LABEL[d] ?? d}</span>)}</div> : null}
        {p.revisionReason ? <p className="ledger-text" style={{ marginTop: 10 }}><strong style={{ fontWeight: 550 }}>Why revised:</strong> {p.revisionReason}</p> : null}
        <div className="row" style={{ justifyContent: "space-between", marginTop: 10 }}>
          <span className="lock"><Icon name="lock" size={12} /> Locked · {SOURCE_NOTE[p.source]}</span>
        </div>
      </div>
    </>
  );
}
