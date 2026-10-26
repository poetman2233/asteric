import type { Metadata } from "next";
import Link from "next/link";
import { pageOrgContext } from "@/server/auth/session";
import { loadPortfolio, todayIso } from "@/server/services/portfolio";
import { listIntake, loadWorkflow, INTAKE_REASONS } from "@/server/services/workflow";
import { applyFilter, parseFilter } from "@/lib/analytics/filters";
import { generateInsights } from "@/lib/analytics/insights";
import { templateForInsight } from "@/lib/rules";
import { FilterBar } from "@/components/app/FilterBar";
import { MonitorButton } from "@/components/app/MonitorButton";
import { Card, Empty, PageHead } from "@/components/ui/Blocks";
import { MethodologyButton } from "@/components/ui/Methodology";
import { date, num } from "@/lib/format";

export const metadata: Metadata = { title: "Firm Learning" };

export default async function FirmLearningPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageOrgContext("/app/insights");
  const f = parseFilter(await searchParams);
  const p = await loadPortfolio(ctx.org.id);
  const wf = await loadWorkflow(ctx);
  const intake = await listIntake(ctx);
  const s = ctx.org.settings;
  const insights = generateInsights(applyFilter(p.facts, f), { attorneyHourlyCost: s.attorneyHourlyCost, defaultContingencyRate: s.defaultContingencyRate, expensesReimbursedFromRecovery: s.expensesReimbursedFromRecovery }, { asOf: todayIso(), staleDays: s.staleDays, expenseThreshold: s.expenseVarianceThreshold });
  const labels = { categories: Object.fromEntries(p.categories.map((c) => [c.key, c.label])), referrals: Object.fromEntries(p.referrals.map((r) => [r.id, r.name])) };
  const monitored = new Set(wf.monitors.map((m) => m.insightId));
  const canManage = ctx.can("rules.manage");
  const yearAgo = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
  const recent = intake.filter((x) => x.i.receivedOn >= yearAgo);
  const byReason = INTAKE_REASONS.map((r) => ({ ...r, n: recent.filter((x) => x.i.reasonCode === r.key).length })).filter((r) => r.n).sort((a, b) => b.n - a.n);

  return (
    <>
      <PageHead title="Firm Learning" sub="What your firm's own records show, how strong the evidence is, and what management can do about it. Findings describe historical patterns; they are not legal advice." actions={<MethodologyButton id="insights" />} />
      <FilterBar options={{ categories: p.categories, attorneys: p.attorneys, referrals: p.referrals, jurisdictions: p.jurisdictions }} />
      <div className="split">
        <div className="stack">
          {insights.length ? insights.map((i) => {
            const tpl = templateForInsight(i.id, labels);
            const rule = wf.rules.find((r) => r.sourceInsight === i.id);
            return (
              <article key={i.id} className="insight">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <p className="insight-kind">{i.kind}</p>
                  <MethodologyButton id={i.methodology} sample={`n = ${i.n}${i.period ? ` · ${i.period}` : ""}`} />
                </div>
                <dl className="learn">
                  <dt>What happened</dt><dd><strong>{i.headline}</strong><span className="insight-detail" style={{ display: "block" }}>{i.detail}</span></dd>
                  <dt>Strength of evidence</dt><dd>{num(i.n)} {i.kind === "Coverage" || i.kind === "Portfolio watch" ? "open matters" : "resolved matters"}{i.period ? ` · ${i.period}` : ""}{i.causalNote ? " · historical association, not a causal finding" : ""}</dd>
                  <dt>Which matters</dt><dd><Link className="link" href={i.href}>View the supporting matters</Link></dd>
                  <dt>What management can do</dt>
                  <dd className="row-wrap" style={{ gap: 8 }}>
                    <MonitorButton id={i.id} label={i.headline} on={monitored.has(i.id)} disabled={!canManage} />
                    {rule ? <span className="badge">Rule {rule.active ? "active" : "paused"}: {rule.name} · {date(rule.createdAt)}</span>
                      : tpl && canManage ? <Link className="btn btn-secondary btn-sm" href={`/app/rules?template=${encodeURIComponent(i.id)}`}>Create review rule</Link> : null}
                    {tpl && !rule ? <span className="help">Suggested template: {tpl.name}</span> : null}
                  </dd>
                </dl>
              </article>
            );
          }) : (
            <Empty title="No findings meet the thresholds yet" actions={[{ href: "/app/data-quality", label: "Review data quality" }]}>
              Asteric reports a pattern only when enough resolved matters support it (typically 12 to 30) and the difference is material.
            </Empty>
          )}
        </div>
        <div className="stack-lg">
          <Card title="Monitored patterns">
            {wf.monitors.length ? <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }} className="stack-sm">{wf.monitors.map((m) => <li key={m.id}>{m.label}<span className="help" style={{ display: "block" }}>Since {date(m.createdAt)}</span></li>)}</ul>
              : <p className="muted" style={{ fontSize: 13 }}>Patterns you choose to monitor appear here.</p>}
          </Card>
          <Card title="Matters the firm declined" actions={<Link className="link" href="/app/intake" style={{ fontSize: 12.5 }}>Intake decisions</Link>}>
            {recent.length ? (
              <>
                <p style={{ fontSize: 13, margin: "0 0 10px" }}><strong>{num(recent.length)}</strong> declined or referred in the last 12 months.</p>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 12.5 }} className="stack-sm">{byReason.slice(0, 6).map((r) => <li key={r.key} className="row" style={{ justifyContent: "space-between" }}><span className="ink2">{r.label}</span><span className="num">{r.n}</span></li>)}</ul>
              </>
            ) : <p className="muted" style={{ fontSize: 13 }}>Recording declined and referred matters keeps learning from being limited to the cases the firm accepted.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
