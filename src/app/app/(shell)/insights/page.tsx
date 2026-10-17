import type { Metadata } from "next";
import Link from "next/link";
import { pageOrgContext } from "@/server/auth/session";
import { loadPortfolio, todayIso } from "@/server/services/portfolio";
import { applyFilter, parseFilter } from "@/lib/analytics/filters";
import { generateInsights } from "@/lib/analytics/insights";
import { FilterBar } from "@/components/app/FilterBar";
import { Empty, PageHead } from "@/components/ui/Blocks";
import { MethodologyButton } from "@/components/ui/Methodology";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageOrgContext("/app/insights");
  const f = parseFilter(await searchParams);
  const p = await loadPortfolio(ctx.org.id);
  const s = ctx.org.settings;
  const ms = applyFilter(p.facts, f);
  const insights = generateInsights(ms, { attorneyHourlyCost: s.attorneyHourlyCost, defaultContingencyRate: s.defaultContingencyRate, expensesReimbursedFromRecovery: s.expensesReimbursedFromRecovery }, { asOf: todayIso(), staleDays: s.staleDays, expenseThreshold: s.expenseVarianceThreshold });

  return (
    <>
      <PageHead title="Insights" sub="Patterns in your firm's own records. Each finding meets a minimum sample size and links to the matters behind it." actions={<MethodologyButton id="insights" />} />
      <FilterBar options={{ categories: p.categories, attorneys: p.attorneys, referrals: p.referrals, jurisdictions: p.jurisdictions }} />
      {insights.length ? (
        <div className="stack">
          {insights.map((i) => (
            <article key={i.id} className="insight">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <p className="insight-kind">{i.kind}</p>
                <MethodologyButton id={i.methodology} sample={`n = ${i.n}${i.period ? ` · ${i.period}` : ""}`} />
              </div>
              <h2 className="insight-head">{i.headline}</h2>
              <p className="insight-detail">{i.detail}</p>
              <div className="insight-meta">
                <span>n = {i.n}</span>
                {i.period ? <span>{i.period}</span> : null}
                {i.causalNote ? <span>Historical association, not a causal finding</span> : null}
                <Link className="link" href={i.href}>View supporting matters</Link>
              </div>
            </article>
          ))}
          <p className="help">Insights are computed deterministically from recorded data each time this page loads. They describe what happened in your firm&apos;s matters; they are not legal advice or a recommendation on any matter.</p>
        </div>
      ) : (
        <Empty title="No findings meet the thresholds yet" actions={[{ href: "/app/data-quality", label: "Review data quality" }]}>
          Asteric only reports a pattern when enough resolved matters support it (typically 12 to 30, depending on the measure) and the difference is material. Import more history or record outcomes to reach those thresholds.
        </Empty>
      )}
    </>
  );
}
