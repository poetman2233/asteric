import type { Metadata } from "next";
import Link from "next/link";
import { pageOrgContext } from "@/server/auth/session";
import { loadPortfolio } from "@/server/services/portfolio";
import { revisionSummary } from "@/lib/analytics/accuracy";
import { SelectParam } from "@/components/app/UrlControls";
import { Card, Empty, Kpi, PageHead } from "@/components/ui/Blocks";
import { date, months, num, pct, range, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Assessments" };

const PAGE = 50;
const SOURCE_LABEL = { prospective: "Prospective", historical: "Historical", sandbox: "Sandbox" } as const;

export default async function PredictionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageOrgContext("/app/predictions");
  const sp = await searchParams;
  const p = await loadPortfolio(ctx.org.id);
  const src = sp.source === "prospective" || sp.source === "historical" || sp.source === "sandbox" ? sp.source : null;
  const author = sp.author || null;
  const rows = p.facts.flatMap((m) => m.predictions.map((x) => ({ m, x })))
    .filter(({ x }) => (!src || x.source === src) && (!author || x.authorAttorneyId === author))
    .sort((a, b) => b.x.recordedAt.localeCompare(a.x.recordedAt));
  const open = p.facts.filter((m) => m.status === "open");
  const covered = open.filter((m) => m.predictions.some((x) => x.source !== "sandbox")).length;
  const rev = revisionSummary(p.facts);
  const last90 = p.facts.flatMap((m) => m.predictions).filter((x) => x.source === "prospective" && Date.now() - Date.parse(x.recordedAt) < 90 * 86400_000).length;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const qs = (n: number) => { const u = new URLSearchParams(); if (src) u.set("source", src); if (author) u.set("author", author); u.set("page", String(n)); return `?${u}`; };

  return (
    <>
      <PageHead title="Assessments" sub="Every assessment recorded across the firm, including no-change confirmations. Assessments are append-only: updates are new versions, and earlier versions are never changed."
        actions={ctx.can("predictions.create") || ctx.role === "demo" ? <Link className="btn btn-primary" href="/app/matters?status=open&hint=record">Record an assessment</Link> : null} />
      <div className="stack-lg">
        <div className="kpis">
          <Kpi label="Coverage of open matters" value={open.length ? pct(covered / open.length) : "—"} foot={`${num(covered)} of ${num(open.length)} open matters`} />
          <Kpi label="Recorded in the last 90 days" value={num(last90)} foot="Assessments, updates and confirmations" />
          <Kpi label="Matters revised" value={num(rev.revised)} foot={`${num(rev.revisions)} revisions in total`} />
          <Kpi label="Median probability change" value={rev.medianAbsDelta != null ? `${Math.round(rev.medianAbsDelta * 100)} pts` : "—"} foot={`${num(rev.upProb)} raised · ${num(rev.downProb)} lowered`} />
        </div>
        <Card title="Assessment log" pad={false} actions={<>
          <SelectParam param="source" label="Source" options={[{ value: "", label: "All sources" }, { value: "prospective", label: "Prospective" }, { value: "historical", label: "Historical (imported)" }, ...(ctx.org.isDemo ? [{ value: "sandbox", label: "Sandbox" }] : [])]} />
          <SelectParam param="author" label="Author" options={[{ value: "", label: "All authors" }, ...p.attorneys.map((a) => ({ value: a.id, label: a.name }))]} />
        </>}>
          {rows.length ? (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="table">
                <caption className="sr-only">Assessment log, newest first</caption>
                <thead><tr><th>Recorded</th><th>Matter</th><th>Version</th><th>Author</th><th className="r">Range</th><th className="r">Favorable</th><th className="r">Duration</th><th className="r">Expense</th><th>Confidence</th><th>Source</th></tr></thead>
                <tbody>
                  {rows.slice((page - 1) * PAGE, page * PAGE).map(({ m, x }) => (
                    <tr key={x.id} className="clickable">
                      <td className="num ink2">{date(x.recordedAt)}</td>
                      <td><Link className="cell-primary" style={{ display: "block" }} href={`/app/matters/${m.id}`}>{m.name}</Link><span className="cell-sub">{m.status === "open" ? "Open" : "Closed"}</span></td>
                      <td>v{x.version}{x.isReaffirmation ? <span className="cell-sub">No change</span> : null}</td>
                      <td className="ink2">{x.authorLabel}</td>
                      <td className="r">{range(x.recoveryLow, x.recoveryHigh)}</td>
                      <td className="r">{pct(x.probability)}</td>
                      <td className="r">{x.expectedDurationMonths != null ? months(x.expectedDurationMonths) : "—"}</td>
                      <td className="r">{x.expectedExpense != null ? usd(x.expectedExpense, { compact: true }) : "—"}</td>
                      <td style={{ textTransform: "capitalize" }} className="ink2">{x.confidence ?? "—"}</td>
                      <td><span className={`badge${x.source === "prospective" ? " badge-accent" : ""}`}>{SOURCE_LABEL[x.source]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="table-foot">
                <span>{num(rows.length)} assessments</span>
                <span className="row" style={{ gap: 8 }}>
                  {page > 1 ? <Link className="btn btn-secondary btn-sm" href={`/app/predictions${qs(page - 1)}`}>Previous</Link> : null}
                  <span>Page {page} of {pages}</span>
                  {page < pages ? <Link className="btn btn-secondary btn-sm" href={`/app/predictions${qs(page + 1)}`}>Next</Link> : null}
                </span>
              </div>
            </div>
          ) : (
            <div className="card-body"><Empty title="No assessments recorded" actions={[{ href: "/app/matters?status=open&hint=record", label: "Choose a matter" }]}>Open a matter and choose Assess matter. It takes about 30 seconds.</Empty></div>
          )}
        </Card>
      </div>
    </>
  );
}
