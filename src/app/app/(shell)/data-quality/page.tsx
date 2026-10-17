import type { Metadata } from "next";
import Link from "next/link";
import { pageOrgContext } from "@/server/auth/session";
import { loadPortfolio } from "@/server/services/portfolio";
import { dataQuality } from "@/lib/analytics/quality";
import { Card, Empty, Kpi, PageHead } from "@/components/ui/Blocks";
import { MethodologyButton } from "@/components/ui/Methodology";
import { num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Data quality" };

export default async function DataQualityPage() {
  const ctx = await pageOrgContext("/app/data-quality");
  const p = await loadPortfolio(ctx.org.id);
  if (!p.facts.length) {
    return (
      <>
        <PageHead title="Data quality" sub="Completeness of the fields each analysis depends on." />
        <Empty title="No matters yet" actions={[{ href: "/app/imports/new", label: "Import matters", primary: true }]}>Data quality is measured once matters are imported.</Empty>
      </>
    );
  }
  const rows = dataQuality(p.facts);
  const closed = p.facts.filter((m) => m.status === "closed").length;
  const withPred = p.facts.filter((m) => m.predictions.some((x) => x.source !== "sandbox")).length;
  const historical = p.facts.filter((m) => m.predictions.some((x) => x.source === "historical")).length;

  return (
    <>
      <PageHead title="Data quality" sub="Completeness of the fields each analysis depends on. Gaps are never filled with estimates; affected matters are excluded and counted." actions={<MethodologyButton id="quality" />} />
      <div className="stack-lg">
        <div className="kpis">
          <Kpi label="Matters" value={num(p.facts.length)} foot={`${num(closed)} closed`} />
          <Kpi label="With a recorded prediction" value={num(withPred)} foot={`${pct(withPred / p.facts.length)} of matters`} />
          <Kpi label="With a historical estimate" value={num(historical)} foot="Imported from source records" />
        </div>
        <Card title="Field completeness" pad={false}>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="table">
              <caption className="sr-only">Field completeness</caption>
              <thead><tr><th>Field</th><th style={{ width: 220 }}>Complete</th><th className="r">Count</th><th>Limits</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td className="cell-primary">{r.label}</td>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <div className="bar-track" style={{ flex: 1 }}><div className="bar-fill" style={{ width: `${Math.round((r.pct ?? 0) * 100)}%` }} /></div>
                        <span className="num" style={{ width: 40, textAlign: "right" }}>{r.pct == null ? "—" : pct(r.pct)}</span>
                      </div>
                    </td>
                    <td className="r ink2">{num(r.numerator)} of {num(r.denominator)}</td>
                    <td className="ink2">{r.affects}</td>
                    <td className="r">{r.denominator - r.numerator > 0 ? <Link className="link" href={`/app/matters?missing=${r.key}`}>{num(r.denominator - r.numerator)} missing</Link> : <span className="pos">✓ Complete</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="help">To fill gaps, correct values on the matter page (changes are logged with the previous value) or import a corrected export. <Link className="link" href="/app/imports">Import history</Link></p>
      </div>
    </>
  );
}
