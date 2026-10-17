import type { Metadata } from "next";
import Link from "next/link";
import { pageOrgContext } from "@/server/auth/session";
import { listImports } from "@/server/imports/pipeline";
import { Empty, PageHead } from "@/components/ui/Blocks";
import { date, num } from "@/lib/format";

export const metadata: Metadata = { title: "Imports" };

const STATUS_LABEL: Record<string, string> = { uploaded: "Mapping columns", mapped: "Mapping columns", reviewing: "Reviewing values", committing: "Importing", completed: "Completed", failed: "Failed", cancelled: "Cancelled" };

export default async function ImportsPage() {
  const ctx = await pageOrgContext("/app/imports");
  const canImport = ctx.can("imports.manage") || ctx.can("imports.preview");
  const rows = ctx.can("imports.view") || ctx.can("imports.preview") ? await listImports(ctx) : [];
  return (
    <>
      <PageHead title="Imports" sub="Bring in matters from your case management system or spreadsheets. Every imported value keeps its original form and how it was normalized."
        actions={canImport ? <Link className="btn btn-primary" href="/app/imports/new">New import</Link> : null} />
      {rows.length ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Imports, newest first</caption>
            <thead><tr><th>File</th><th>Source</th><th>Status</th><th className="r">Rows</th><th className="r">Created</th><th className="r">Skipped</th><th>Uploaded</th></tr></thead>
            <tbody>
              {rows.map((i) => {
                const r = (i.report ?? {}) as Record<string, unknown>;
                return (
                  <tr key={i.id} className="clickable">
                    <td><Link className="cell-primary mono" style={{ display: "block" }} href={`/app/imports/${i.id}`}>{i.filename}</Link></td>
                    <td className="ink2" style={{ textTransform: "capitalize" }}>{i.sourceSystem ?? "Spreadsheet"}</td>
                    <td><span className={`badge${i.status === "completed" ? " badge-pos" : i.status === "failed" ? " badge-neg" : i.status === "cancelled" ? "" : " badge-accent"}`}>{STATUS_LABEL[i.status] ?? i.status}</span></td>
                    <td className="r">{num(i.rowCount)}</td>
                    <td className="r">{i.status === "completed" ? num(Number(r.created ?? 0)) : "—"}</td>
                    <td className="r">{i.status === "completed" ? num(Number(r.skippedDuplicates ?? 0) + Number(r.errorRows ?? 0)) : "—"}</td>
                    <td className="ink2">{date(i.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="No imports yet" actions={canImport ? [{ href: "/app/imports/new", label: "Start an import", primary: true }, { href: "/samples/asteric-sample-import.csv", label: "Download a sample file" }] : undefined}>
          Export closed and open matters from Filevine, Litify, Clio, Salesforce, SmartAdvocate or a spreadsheet as CSV or XLSX. Asteric suggests a column mapping, normalizes values and asks you to confirm anything uncertain before anything is saved.
        </Empty>
      )}
    </>
  );
}
