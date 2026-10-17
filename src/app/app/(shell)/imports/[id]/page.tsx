import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pageOrgContext } from "@/server/auth/session";
import { getImportDetail, type StoredMapping, type RowIssue } from "@/server/imports/pipeline";
import { CANONICAL_FIELDS } from "@/lib/imports/fields";
import { RESOLUTIONS } from "@/lib/taxonomy";
import { CommitBar, MappingEditor, ReviewPanel } from "@/components/app/ImportFlow";
import { Card, Kpi, PageHead } from "@/components/ui/Blocks";
import { dateTime, num } from "@/lib/format";

export const metadata: Metadata = { title: "Import" };

const STEPS = ["Upload", "Map columns", "Review values", "Commit"];

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await pageOrgContext(`/app/imports/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await getImportDetail(ctx, id);
  if (!d) notFound();
  const { imp } = d;
  const editable = ctx.can("imports.manage") || ctx.can("imports.preview");
  const report = (imp.report ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const columns = (imp.mapping as StoredMapping).columns ?? [];
  const step = imp.status === "uploaded" || imp.status === "mapped" ? 1 : imp.status === "reviewing" ? 2 : 3;
  const fields = CANONICAL_FIELDS.map((f) => ({ key: f.key, label: f.label, group: f.group }));
  const pendingReviews = d.reviews.filter((r) => r.decision === "pending").length;

  return (
    <>
      <nav aria-label="Breadcrumb" className="help" style={{ marginBottom: 10 }}><Link className="link" href="/app/imports">Imports</Link> / <span className="mono">{imp.filename}</span></nav>
      <PageHead title={imp.filename} sub={`${num(imp.rowCount)} rows · ${imp.sourceSystem ? `Detected ${imp.sourceSystem} export` : "Spreadsheet"} · Uploaded ${dateTime(imp.createdAt, ctx.org.timezone)}`} />
      {imp.status !== "cancelled" && imp.status !== "failed" ? (
        <>
          <div className="steps" aria-hidden="true">{STEPS.map((s, i) => <span key={s} className="step" data-done={i <= step} />)}</div>
          <p className="eyebrow" style={{ marginTop: -18, marginBottom: 18 }}>Step {Math.min(step + 1, 4)} of 4 · {STEPS[Math.min(step, 3)]}</p>
        </>
      ) : null}

      {imp.status === "cancelled" ? <div className="alert alert-info"><span>This import was cancelled and its uploaded file deleted. No matters were added.</span></div> : null}
      {imp.status === "failed" ? <div className="alert alert-error"><span>This import failed and nothing was saved. {imp.error ?? ""} Upload the file again to retry.</span></div> : null}

      {step === 1 && imp.status !== "cancelled" ? (
        <Card title="Map columns" sub="Asteric suggested a field for each column from its header and values. Check them, change anything that is wrong, then confirm.">
          <MappingEditor importId={imp.id} columns={columns} fields={fields} editable={editable} />
        </Card>
      ) : null}

      {imp.status === "reviewing" ? (
        <div className="stack-lg">
          <div className="kpis">
            <Kpi label="Rows" value={num(report.rowsParsed)} foot={`${num(report.fieldsRecognized)} fields mapped`} />
            <Kpi label="Values normalized automatically" value={num(report.valuesAutoNormalized)} foot="Confidence 85% or higher" />
            <Kpi label="Values to review" value={num(pendingReviews)} foot={`${num(report.valuesNeedingReview)} initially below 85%`} />
            <Kpi label="Possible duplicates" value={num(report.possibleDuplicates)} foot="Same ID or same name and date" />
            <Kpi label="Rows with errors" value={num(report.errorRows)} foot="Missing a name and ID" />
          </div>
          {report.missingFields?.length ? <div className="alert alert-info"><span><strong>Not in this file:</strong> {report.missingFields.join(", ")}. Analyses that need these fields will exclude these matters and say so.</span></div> : null}
          <Card title="Review normalized values" sub="Each distinct value is shown once with the number of rows using it. Your decisions apply to every one of those rows.">
            <ReviewPanel importId={imp.id} editable={editable} items={d.reviews.map((r) => ({ id: r.id, field: r.field, originalValue: r.originalValue, suggestedValue: r.suggestedValue, confidence: r.confidence, method: r.method, decision: r.decision, finalValue: r.finalValue, occurrences: r.occurrences }))}
              options={{ categories: d.categories, statuses: [{ key: "open", label: "Open" }, { key: "closed", label: "Closed" }], resolutions: RESOLUTIONS.map((r) => ({ key: r.key, label: r.label })), attorneys: d.attorneyNames, referrals: d.referralNames }} />
          </Card>
          {d.issueRows.length ? (
            <Card title="Rows that will be skipped or need attention" pad={false}>
              <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 360 }}>
                <table className="table table-compact">
                  <thead><tr><th>Row</th><th>Status</th><th>Issue</th></tr></thead>
                  <tbody>{d.issueRows.map((r) => (
                    <tr key={r.id}><td className="num">{r.rowNumber}</td><td><span className={`badge${r.status === "error" ? " badge-neg" : ""}`}>{r.status === "error" ? "Error" : "Duplicate"}</span></td><td style={{ whiteSpace: "normal" }}>{(r.issues as RowIssue[]).map((i) => i.detail).join("; ")}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          ) : null}
          <details className="card card-pad">
            <summary style={{ cursor: "pointer", fontWeight: 550 }}>Column mapping ({columns.filter((c) => c.field).length} mapped)</summary>
            <div style={{ marginTop: 14 }}><MappingEditor importId={imp.id} columns={columns} fields={fields} editable={editable} /></div>
          </details>
          {editable ? <CommitBar importId={imp.id} pendingReviews={pendingReviews} duplicates={Number(report.possibleDuplicates ?? 0)} canCommit={ctx.can("imports.manage")} demo={ctx.org.isDemo} /> : null}
        </div>
      ) : null}

      {imp.status === "completed" ? (
        <div className="stack-lg">
          <div className="alert alert-success"><span>Import completed {imp.committedAt ? dateTime(imp.committedAt, ctx.org.timezone) : ""}. {report.synthetic ? "This is a synthetic import record for the demonstration workspace." : ""}</span></div>
          <div className="kpis">
            <Kpi label="Rows read" value={num(report.rowsParsed)} />
            <Kpi label="Matters created" value={num(report.created)} />
            <Kpi label="Duplicates skipped" value={num(report.skippedDuplicates)} />
            <Kpi label="Rows with errors" value={num(report.errorRows)} />
            <Kpi label="Rows normalized automatically" value={num(report.autoNormalizedRows)} />
            <Kpi label="Rows using a reviewed value" value={num(report.reviewedRows)} />
          </div>
          <Card title="Coverage of imported matters" sub="Share of imported matters carrying each field. Missing values were left blank, never estimated.">
            <dl className="dl">
              <dt>Outcome (closed)</dt><dd>{report.coverage?.outcome ?? "—"}%</dd>
              <dt>Litigation expenses</dt><dd>{report.coverage?.expenses ?? "—"}%</dd>
              <dt>Attorney fee (favorable)</dt><dd>{report.coverage?.fee ?? "—"}%</dd>
              <dt>Referral source</dt><dd>{report.coverage?.referral ?? "—"}%</dd>
              <dt>Historical estimate (closed)</dt><dd>{report.coverage?.historicalPredictions ?? "—"}%</dd>
            </dl>
            {report.missingFields?.length ? <p className="help" style={{ marginTop: 12 }}>Not present in the file: {report.missingFields.join(", ")}.</p> : null}
          </Card>
          <div className="row" style={{ gap: 8 }}>
            <Link className="btn btn-primary" href="/app">View portfolio</Link>
            <Link className="btn btn-secondary" href="/app/data-quality">Review data quality</Link>
          </div>
          {d.reviews.length ? (
            <Card title="Normalization decisions" pad={false}>
              <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: 420 }}>
                <table className="table table-compact">
                  <thead><tr><th>Field</th><th>Value in file</th><th className="r">Rows</th><th>Imported as</th><th>Decision</th></tr></thead>
                  <tbody>{d.reviews.map((r) => (
                    <tr key={r.id}><td className="ink2">{r.field.replace("_", " ")}</td><td className="mono">{r.originalValue}</td><td className="r">{r.occurrences}</td><td>{d.categories.find((c) => c.key === r.finalValue)?.label ?? r.finalValue ?? <span className="muted">Blank</span>}</td><td className="ink2">{r.reviewedBy ? (r.decision === "corrected" ? "Corrected by reviewer" : "Accepted by reviewer") : r.decision === "pending" ? "Not reviewed" : `Automatic (${Math.round(r.confidence * 100)}%)`}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
