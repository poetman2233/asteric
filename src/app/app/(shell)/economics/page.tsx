import type { Metadata } from "next";
import Link from "next/link";
import { pageOrgContext } from "@/server/auth/session";
import { loadPortfolio } from "@/server/services/portfolio";
import { applyFilter, filterToQuery, parseFilter } from "@/lib/analytics/filters";
import { aggregateEconomics, economicsBy, MIN_GROUP_RESOLVED, type Dimension, type GroupEconomics } from "@/lib/analytics/economics";
import { sum } from "@/lib/analytics/stats";
import { FilterBar } from "@/components/app/FilterBar";
import { SegParam } from "@/components/app/UrlControls";
import { Card, Empty, Kpi, PageHead } from "@/components/ui/Blocks";
import { MethodologyButton } from "@/components/ui/Methodology";
import { HBarChart } from "@/components/charts/Charts";
import { months, multiple, num, pct, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Economics" };

const DIMS: { value: Dimension; label: string }[] = [
  { value: "category", label: "Category" }, { value: "attorney", label: "Attorney" }, { value: "referral", label: "Referral source" },
  { value: "jurisdiction", label: "Jurisdiction" }, { value: "year", label: "Year resolved" },
];
const FILTER_PARAM: Partial<Record<Dimension, string>> = { category: "category", attorney: "attorney", referral: "referral", jurisdiction: "jurisdiction" };

export default async function EconomicsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageOrgContext("/app/economics");
  const sp = await searchParams;
  const f = parseFilter(sp);
  const dim = (DIMS.find((d) => d.value === sp.dim)?.value ?? "category") as Dimension;
  const s = ctx.org.settings;
  const a = { attorneyHourlyCost: s.attorneyHourlyCost, defaultContingencyRate: s.defaultContingencyRate, expensesReimbursedFromRecovery: s.expensesReimbursedFromRecovery };
  const full = sp.cost === "full";
  const p = await loadPortfolio(ctx.org.id);
  const ms = applyFilter(p.facts, { ...f, dateBasis: f.dateBasis ?? "resolved" });
  const all = aggregateEconomics("all", "Portfolio", ms, a);
  const rolc = (g: GroupEconomics) => (full ? g.rolcFull : g.rolcExpense);
  const groups = economicsBy(ms, dim, a).filter((g) => g.resolved > 0).sort((x, y) => (rolc(y) ?? -1) - (rolc(x) ?? -1));
  const refMs = ms.filter((m) => m.referralId);
  const refs = economicsBy(refMs, "referral", a).filter((g) => g.resolved > 0).sort((x, y) => (y.medianRecovery ?? 0) - (x.medianRecovery ?? 0));
  const refFees = (key: string) => sum(refMs.filter((m) => m.referralId === key && m.outcome).map((m) => m.outcome!.referralFeePaid ?? 0));
  const fullAvailable = all.rolcFull != null;
  const groupHref = (g: GroupEconomics) => {
    const param = FILTER_PARAM[dim];
    return param ? `/app/matters${filterToQuery(f, { [param]: g.key, status: "closed" })}` : `/app/matters${filterToQuery({ ...f, dateBasis: "resolved", from: `${g.key}-01-01`, to: `${g.key}-12-31` }, { status: "closed" })}`;
  };

  if (!all.resolved) {
    return (
      <>
        <PageHead title="Economics" sub="Return on legal capital across resolved matters." />
        <Empty title="No resolved matters in this view" actions={[{ href: "/app/imports/new", label: "Import closed matters", primary: true }]}>Economics are computed from resolved matters with recorded fees and litigation expenses.</Empty>
      </>
    );
  }

  return (
    <>
      <PageHead title="Economics" sub="Return on legal capital: what each dollar of litigation capital returned to the firm on resolved matters." />
      <div className="row-wrap" style={{ marginBottom: 12, gap: 10 }}>
        <SegParam param="cost" label="Capital basis" options={[{ value: "expense", label: "Expense-only" }, { value: "full", label: "Fully costed" }]} />
        <MethodologyButton id="rolc" sample={`${num(all.included)} resolved matters with fees and expenses; ${num(all.excluded)} excluded for missing data`} />
      </div>
      <FilterBar options={{ categories: p.categories, attorneys: p.attorneys, referrals: p.referrals, jurisdictions: p.jurisdictions }} show={{ category: true, attorney: true, referral: true, jurisdiction: true, dates: true }} dateBasisDefault="resolved" />

      {full && !fullAvailable ? (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          <span>Fully costed ROLC needs an attorney hourly cost{ctx.can("org.manage") ? <> (set it in <Link className="link" href="/app/settings/organization">organization settings</Link>)</> : " (an owner or admin can set it)"} and attorney hours on at least 80% of resolved matters.</span>
        </div>
      ) : null}

      <div className="stack-lg">
        <div className="kpis">
          <Kpi label={`ROLC · ${full ? "fully costed" : "expense-only"}`} value={rolc(all) != null ? multiple(rolc(all)) : "Not available"} pending={rolc(all) == null} foot={`${num(all.included)} resolved matters`} tip={full ? "Return ÷ (litigation expenses + attorney hours × configured hourly cost)." : "Return ÷ litigation expenses advanced. Attorney time is not counted as capital."} />
          <Kpi label="Net fees" value={usd(all.totalNetFees, { compact: true })} foot="Attorney fees less referral fees paid" />
          <Kpi label="Litigation capital" value={usd(all.capitalDeployed, { compact: true })} foot="Expenses advanced on included matters" />
          <Kpi label="Favorable rate" value={pct(all.favorableRate)} foot={`${num(all.resolved)} resolved matters`} />
          <Kpi label="Median recovery" value={usd(all.medianRecovery, { compact: true })} foot="Favorable resolutions" />
          <Kpi label="Median duration" value={months(all.medianDuration)} foot="Opening to resolution" />
        </div>
        {all.feeDerivedCount ? <p className="help">{num(all.feeDerivedCount)} matters have no recorded attorney fee; their fee is derived from the configured default contingency rate ({pct(s.defaultContingencyRate)}).</p> : null}

        <Card title={`ROLC by ${DIMS.find((d) => d.value === dim)!.label.toLowerCase()}`} sub={`Groups with fewer than ${MIN_GROUP_RESOLVED} resolved matters are shown in gray and are not ranked in insights.`}
          actions={<SegParam param="dim" label="Group by" options={DIMS} />}>
          <HBarChart data={groups.map((g) => ({ key: g.key, label: g.label, value: rolc(g), display: rolc(g) != null ? multiple(rolc(g)) : "—", muted: g.resolved < MIN_GROUP_RESOLVED, detail: [["Resolved", String(g.resolved)], ["Net fees", usd(g.totalNetFees, { compact: true })], ["Capital", usd(g.capitalDeployed, { compact: true })]] }))}
            format="multiple" reference={rolc(all)} referenceLabel="Portfolio" />
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="table">
              <caption className="sr-only">Economics by group</caption>
              <thead><tr><th>Group</th><th className="r">Resolved</th><th className="r">Favorable</th><th className="r">Median recovery</th><th className="r">Median duration</th><th className="r">Median expense</th><th className="r">Net fees</th><th className="r">Capital</th><th className="r">ROLC</th><th /></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.key}>
                    <td className="cell-primary">{g.label}</td>
                    <td className="r">{g.resolved}</td>
                    <td className="r">{pct(g.favorableRate)}</td>
                    <td className="r">{usd(g.medianRecovery, { compact: true })}</td>
                    <td className="r">{months(g.medianDuration)}</td>
                    <td className="r">{usd(g.medianExpense, { compact: true })}</td>
                    <td className="r">{usd(g.totalNetFees, { compact: true })}</td>
                    <td className="r">{usd(g.capitalDeployed, { compact: true })}</td>
                    <td className="r"><strong style={{ fontWeight: 550 }}>{rolc(g) != null ? multiple(rolc(g)) : "—"}</strong>{g.resolved < MIN_GROUP_RESOLVED ? <span className="cell-sub" style={{ display: "block" }}>Small sample</span> : null}</td>
                    <td className="r">{g.key !== "__none" ? <Link className="link" href={groupHref(g)}>Matters</Link> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Referral-source economics" sub="Recovery size alone can mislead: referral fee splits, duration and expense determine what a source returns on capital." actions={<MethodologyButton id="referral" sample={`${num(refMs.filter((m) => m.outcome).length)} resolved matters with a referral source`} />} pad={false}>
          {refs.length ? (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="table">
                <caption className="sr-only">Economics by referral source, ordered by median recovery</caption>
                <thead><tr><th>Referral source</th><th className="r">Matters</th><th className="r">Resolved</th><th className="r">Favorable</th><th className="r">Median recovery</th><th className="r">Referral fees paid</th><th className="r">Median duration</th><th className="r">Median expense</th><th className="r">ROLC</th></tr></thead>
                <tbody>
                  {refs.map((g) => (
                    <tr key={g.key}>
                      <td><Link className="cell-primary" href={`/app/matters${filterToQuery(f, { referral: g.key })}`}>{g.label}</Link></td>
                      <td className="r">{g.matters}</td>
                      <td className="r">{g.resolved}</td>
                      <td className="r">{pct(g.favorableRate)}</td>
                      <td className="r">{usd(g.medianRecovery, { compact: true })}</td>
                      <td className="r">{usd(refFees(g.key), { compact: true })}</td>
                      <td className="r">{months(g.medianDuration)}</td>
                      <td className="r">{usd(g.medianExpense, { compact: true })}</td>
                      <td className="r"><strong style={{ fontWeight: 550 }} className={rolc(g) != null && rolc(all) != null && rolc(g)! < rolc(all)! * 0.75 ? "neg" : undefined}>{rolc(g) != null ? multiple(rolc(g)) : "—"}</strong>{g.resolved < MIN_GROUP_RESOLVED ? <span className="cell-sub" style={{ display: "block" }}>Small sample</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="card-body muted">No resolved matters in this view have a referral source.</div>}
        </Card>

        <Card title="Assumptions" sub="Configured per organization. They change how economics are computed, never the recorded data.">
          <dl className="dl">
            <dt>Expenses reimbursed</dt><dd>{s.expensesReimbursedFromRecovery ? "Yes: litigation expenses are repaid from a favorable recovery and counted in return" : "No: expenses are not counted as returned"}</dd>
            <dt>Attorney hourly cost</dt><dd>{s.attorneyHourlyCost != null ? `${usd(s.attorneyHourlyCost)} per hour (used for fully costed ROLC)` : "Not set (fully costed ROLC unavailable)"}</dd>
            <dt>Default contingency rate</dt><dd>{s.defaultContingencyRate != null ? `${pct(s.defaultContingencyRate)} (used only where a fee is missing; labeled as derived)` : "Not set (matters missing a fee are excluded)"}</dd>
          </dl>
          {ctx.can("org.manage") ? <p className="help" style={{ marginTop: 12 }}><Link className="link" href="/app/settings/organization">Change assumptions</Link></p> : null}
        </Card>
      </div>
    </>
  );
}
