import type { Metadata } from "next";
import Link from "next/link";
import { pageOrgContext } from "@/server/auth/session";
import { loadPortfolio, todayIso } from "@/server/services/portfolio";
import { applyFilter, parseFilter } from "@/lib/analytics/filters";
import { portfolioWatch, WATCH_LABEL, type WatchKind } from "@/lib/analytics/watch";
import { FilterBar } from "@/components/app/FilterBar";
import { SelectParam } from "@/components/app/UrlControls";
import { Empty, PageHead } from "@/components/ui/Blocks";
import { MethodologyButton } from "@/components/ui/Methodology";
import { num } from "@/lib/format";

export const metadata: Metadata = { title: "Portfolio Watch" };

const SEV_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;

export default async function WatchPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageOrgContext("/app/watch");
  const sp = await searchParams;
  const f = parseFilter(sp);
  const p = await loadPortfolio(ctx.org.id);
  const s = ctx.org.settings;
  const all = portfolioWatch(applyFilter(p.facts, { ...f, status: "open" }), { asOf: todayIso(), staleDays: s.staleDays, expenseThreshold: s.expenseVarianceThreshold });
  const kind = sp.kind && sp.kind in WATCH_LABEL ? (sp.kind as WatchKind) : null;
  const sev = sp.sev === "high" || sp.sev === "medium" || sp.sev === "low" ? sp.sev : null;
  const flags = all.filter((x) => (!kind || x.kind === kind) && (!sev || x.severity === sev));
  const counts = Object.fromEntries((Object.keys(WATCH_LABEL) as WatchKind[]).map((k) => [k, all.filter((x) => x.kind === k).length]));
  const matterCount = new Set(flags.map((x) => x.matterId)).size;

  return (
    <>
      <PageHead title="Portfolio Watch" sub="Each open matter beside the assumptions in its latest assessment: original assumption, current reality and the variance. The attorney decides what a variance means." actions={<MethodologyButton id="watch" />} />
      <FilterBar options={{ categories: p.categories, attorneys: p.attorneys, referrals: p.referrals, jurisdictions: p.jurisdictions }} show={{ category: true, attorney: true, referral: true, jurisdiction: true }}
        extra={<>
          <SelectParam param="kind" label="Flag type" options={[{ value: "", label: "All flag types" }, ...(Object.keys(WATCH_LABEL) as WatchKind[]).filter((k) => counts[k]).map((k) => ({ value: k, label: `${WATCH_LABEL[k]} (${counts[k]})` }))]} />
          <SelectParam param="sev" label="Severity" options={[{ value: "", label: "All severities" }, { value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }]} />
        </>} />
      <p className="help" style={{ marginBottom: 12 }}>
        {num(flags.length)} flag{flags.length === 1 ? "" : "s"} on {num(matterCount)} open matter{matterCount === 1 ? "" : "s"}. Thresholds: expenses more than {Math.round(s.expenseVarianceThreshold * 100)}% over the latest forecast; latest prediction older than {s.staleDays} days.
        {ctx.can("org.manage") ? <> <Link className="link" href="/app/settings/organization">Adjust thresholds</Link></> : null}
      </p>
      {flags.length ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Portfolio Watch flags, most severe first</caption>
            <thead><tr><th>Matter</th><th>Original assumption</th><th>Current reality</th><th className="r">Variance</th><th className="r">Last assessment</th><th /></tr></thead>
            <tbody>
              {flags.map((w) => (
                <tr key={`${w.matterId}-${w.kind}`}>
                  <td><span className="row" style={{ gap: 8, alignItems: "flex-start" }}><span className="watch-sev" role="img" data-sev={w.severity} aria-label={`${SEV_LABEL[w.severity]} severity`} style={{ height: 30 }} /><span><Link className="cell-primary" style={{ display: "block" }} href={`/app/matters/${w.matterId}`}>{w.matterName}</Link><span className="cell-sub">{w.title} · {w.attorneyName ?? "No lead attorney"}</span></span></span></td>
                  <td className="ink2">{w.assumption ?? "—"}</td>
                  <td>{w.reality ?? "—"}</td>
                  <td className="r"><strong style={{ fontWeight: 550 }}>{w.variance ?? w.metric ?? ""}</strong></td>
                  <td className="r ink2">{w.lastAssessmentDays != null ? `${w.lastAssessmentDays} days ago` : "—"}</td>
                  <td className="r"><Link className="btn btn-secondary btn-sm" href={`/app/matters/${w.matterId}?review=watch:${w.kind}:${w.matterId}`}>{w.kind === "no_prediction" ? "Record assessment" : w.kind.startsWith("duration") ? "Review matter" : "Review assessment"}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title={all.length ? "No flags match these filters" : "Nothing to review"}>
          {all.length ? "Try clearing the filters." : "No open matter has drifted from its latest recorded assumptions."}
        </Empty>
      )}
    </>
  );
}
