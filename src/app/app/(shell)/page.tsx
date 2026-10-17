import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pageOrgContext } from "@/server/auth/session";
import { loadPortfolio, todayIso } from "@/server/services/portfolio";
import { applyFilter, filterToQuery, parseFilter } from "@/lib/analytics/filters";
import { calibration, forecastPairs, MIN_CALIBRATION_N } from "@/lib/analytics/calibration";
import { aggregateEconomics } from "@/lib/analytics/economics";
import { portfolioWatch, WATCH_LABEL } from "@/lib/analytics/watch";
import { generateInsights } from "@/lib/analytics/insights";
import { dataQuality } from "@/lib/analytics/quality";
import { median, monthsBetween, sum } from "@/lib/analytics/stats";
import { FilterBar } from "@/components/app/FilterBar";
import { Card, Empty, Kpi, PageHead } from "@/components/ui/Blocks";
import { MethodologyButton } from "@/components/ui/Methodology";
import { CalibrationChart } from "@/components/charts/Charts";
import { months, multiple, num, pct, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Portfolio overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageOrgContext("/app");
  if (!ctx.org.isDemo && ctx.can("org.manage") && !ctx.org.onboardingCompletedAt) redirect("/app/onboarding");
  const sp = await searchParams;
  const f = parseFilter(sp);
  const p = await loadPortfolio(ctx.org.id);
  const s = ctx.org.settings;
  const assumptions = { attorneyHourlyCost: s.attorneyHourlyCost, defaultContingencyRate: s.defaultContingencyRate, expensesReimbursedFromRecovery: s.expensesReimbursedFromRecovery };

  if (!p.facts.length) {
    return (
      <>
        <PageHead title="Portfolio overview" sub="Decision quality and legal-capital performance across your firm." />
        <Empty title="No matters yet" actions={[{ href: "/app/imports/new", label: "Import historical matters", primary: true }, { href: "/samples/asteric-sample-import.csv", label: "Download a sample file" }]}>
          Import an export of your closed and open matters to build the portfolio view. Asteric reads CSV and XLSX exports from Filevine, Litify, Clio, Salesforce, SmartAdvocate and spreadsheets. Analytics populate as soon as the import is committed.
        </Empty>
      </>
    );
  }

  const ms = applyFilter(p.facts, f);
  const open = ms.filter((m) => m.status === "open");
  const closed = ms.filter((m) => m.status === "closed");
  const openWithExp = open.filter((m) => m.expensesToDate != null);
  const capital = sum(openWithExp.map((m) => m.expensesToDate!));
  const durations = closed.filter((m) => m.openedOn && m.outcome).map((m) => monthsBetween(m.openedOn!, m.outcome!.resolvedOn));
  const covered = open.filter((m) => m.predictions.some((x) => x.source !== "sandbox")).length;
  const pairs = forecastPairs(ms);
  const cal = calibration(pairs);
  const econ = aggregateEconomics("all", "All", ms, assumptions);
  const watch = portfolioWatch(ms, { asOf: todayIso(), staleDays: s.staleDays, expenseThreshold: s.expenseVarianceThreshold });
  const insights = generateInsights(ms, assumptions, { asOf: todayIso(), staleDays: s.staleDays, expenseThreshold: s.expenseVarianceThreshold }).slice(0, 3);
  const dq = dataQuality(ms);
  const q = filterToQuery(f);

  return (
    <>
      <PageHead
        title="Portfolio overview"
        sub="Decision quality and legal-capital performance across your firm."
        actions={<><Link className="btn btn-secondary" href={`/app/matters${q}`}>View {num(ms.length)} matters</Link>{ctx.can("imports.manage") ? <Link className="btn btn-primary" href="/app/imports/new">Import data</Link> : null}</>}
      />
      <FilterBar options={{ categories: p.categories, attorneys: p.attorneys, referrals: p.referrals, jurisdictions: p.jurisdictions }} />

      <div className="kpis" style={{ marginBottom: 20 }}>
        <Kpi label="Open matters" value={num(open.length)} foot={`${num(ms.length)} in view`} />
        <Kpi label="Closed matters" value={num(closed.length)} foot={`${num(closed.filter((m) => m.outcome).length)} with recorded outcomes`} />
        <Kpi label="Capital at work" value={openWithExp.length ? usd(capital, { compact: true }) : "No expense data"} pending={!openWithExp.length}
          foot={`Expenses advanced on ${num(openWithExp.length)} of ${num(open.length)} open matters`} tip="Litigation expenses currently advanced on open matters. Attorney time is not included." />
        <Kpi label="Median duration" value={durations.length ? months(median(durations)) : "No resolved matters"} pending={!durations.length} foot={`${num(durations.length)} resolved matters`} />
        <Kpi label="Prediction coverage" value={open.length ? pct(covered / open.length) : "—"} foot={`${num(covered)} of ${num(open.length)} open matters`} tip="Share of open matters with at least one recorded prediction." />
        <Kpi label="Brier score" value={cal.sufficient ? cal.brier!.toFixed(3) : `${cal.n} resolved predictions`} pending={!cal.sufficient}
          foot={cal.sufficient ? `Lower is better · n = ${cal.n}` : `Shown from ${MIN_CALIBRATION_N} resolved predictions`} />
        <Kpi label="Return on legal capital" value={econ.included >= 10 && econ.rolcExpense != null ? multiple(econ.rolcExpense) : `${econ.included} matters with fees and expenses`} pending={!(econ.included >= 10 && econ.rolcExpense != null)}
          foot={econ.included >= 10 ? `Expense-only · ${num(econ.included)} resolved matters` : "Needs recorded fees and expenses"} />
      </div>

      <div className="split">
        <div className="stack-lg">
          <Card title="Calibration" sub="Initial predictions against what happened" actions={<><MethodologyButton id="calibration" sample={`${cal.n} resolved matters with a prediction recorded before resolution`} /><Link className="link" href={`/app/calibration${q}`} style={{ fontSize: 12.5 }}>Open</Link></>}>
            {cal.sufficient ? (
              <CalibrationChart height={280} points={cal.bins.filter((b) => b.n > 0).map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, meanPredicted: b.meanPredicted!, observed: b.observed!, ciLo: b.ci!.lo, ciHi: b.ci!.hi, sufficient: b.sufficient }))} />
            ) : (
              <Empty title="Not enough resolved predictions yet" actions={[{ href: "/app/predictions", label: "View prediction coverage" }]}>
                Calibration requires predictions recorded before outcomes were known. {cal.n} resolved matters in this view have one; the curve appears at {MIN_CALIBRATION_N}.
              </Empty>
            )}
          </Card>
          <Card title="What the data shows" sub="Computed from your records · historical association, not causation" actions={<Link className="link" href="/app/insights" style={{ fontSize: 12.5 }}>All insights</Link>}>
            {insights.length ? (
              <div className="stack">
                {insights.map((i) => (
                  <div key={i.id} style={{ paddingBottom: 14, borderBottom: "1px solid var(--line-soft)" }}>
                    <p className="insight-kind">{i.kind}</p>
                    <p className="insight-head">{i.headline}</p>
                    <div className="insight-meta"><span>n = {i.n}</span>{i.period ? <span>{i.period}</span> : null}<Link className="link" href={i.href}>View supporting matters</Link></div>
                  </div>
                ))}
              </div>
            ) : <p className="muted">No finding meets the minimum sample and materiality thresholds for this view yet.</p>}
          </Card>
        </div>

        <div className="stack-lg">
          <Card title="Portfolio Watch" sub="Open matters drifting from their latest prediction" pad={false} actions={<Link className="link" href="/app/watch" style={{ fontSize: 12.5 }}>Open</Link>}>
            {watch.length ? (
              <div>
                {watch.slice(0, 6).map((w) => (
                  <Link key={`${w.matterId}-${w.kind}`} href={`/app/matters/${w.matterId}`} className="watch-item" style={{ display: "grid" }}>
                    <span className="watch-sev" data-sev={w.severity} aria-hidden="true" />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.matterName}</span>
                      <span className="help">{WATCH_LABEL[w.kind]}</span>
                    </span>
                    <span className="num" style={{ fontSize: 12.5, fontWeight: 550 }}>{w.metric ?? ""}</span>
                  </Link>
                ))}
              </div>
            ) : <div className="card-body muted">No open matter has drifted from its latest assumptions.</div>}
          </Card>
          <Card title="Data quality" actions={<Link className="link" href="/app/data-quality" style={{ fontSize: 12.5 }}>Details</Link>}>
            <div className="stack-sm">
              {dq.filter((r) => ["outcome", "expenses", "referral", "historical_predictions", "prospective_coverage"].includes(r.key)).map((r) => (
                <div key={r.key}>
                  <div className="row" style={{ justifyContent: "space-between", fontSize: 12.5 }}><span className="ink2">{r.label}</span><span className="num">{pct(r.pct)}</span></div>
                  <div className="bar-track" style={{ marginTop: 5 }}><div className="bar-fill" style={{ width: `${Math.round((r.pct ?? 0) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
