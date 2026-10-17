import type { Metadata } from "next";
import Link from "next/link";
import { pageOrgContext } from "@/server/auth/session";
import { config } from "@/server/config";
import { UploadForm } from "@/components/app/ImportFlow";
import { Card, Empty, PageHead } from "@/components/ui/Blocks";

export const metadata: Metadata = { title: "New import" };

export default async function NewImportPage() {
  const ctx = await pageOrgContext("/app/imports/new");
  if (!ctx.can("imports.manage") && !ctx.can("imports.preview")) {
    return <><PageHead title="New import" /><Empty title="Not available for your role">Owners, administrators and analysts can import data.</Empty></>;
  }
  const ai = config.aiProvider !== "none" && ctx.org.settings.aiAssistEnabled;
  return (
    <>
      <nav aria-label="Breadcrumb" className="help" style={{ marginBottom: 10 }}><Link className="link" href="/app/imports">Imports</Link> / New</nav>
      <PageHead title="Import matters" sub="Upload an export. Nothing is added to your workspace until you review the mapping and commit." />
      <div className="split">
        <Card><UploadForm aiNote={ai ? "AI-assisted mapping is on: for columns Asteric cannot place, only column headers and value types (never cell contents) are sent to the AI provider, and its suggestions require your confirmation." : null} /></Card>
        <div className="stack-lg">
          <Card title="What to include">
            <ul style={{ margin: 0, paddingLeft: 18 }} className="stack-sm">
              <li>One row per matter, with a matter name or ID.</li>
              <li>Category, lead attorney, referral source, date opened and status.</li>
              <li>For closed matters: date closed, disposition, gross recovery, attorney fee and litigation expenses.</li>
              <li>Optional: intake probability or value estimates recorded at the time, imported as historical estimates.</li>
            </ul>
            <p className="help" style={{ marginTop: 12 }}>Leave out client contact details, notes and documents. Asteric does not need them.</p>
          </Card>
          <Card title="Try it with sample data">
            <p className="help">A deliberately messy 64-row export with inconsistent categories, name variants, duplicates and an unreadable row.</p>
            <a className="btn btn-secondary" style={{ marginTop: 10 }} href="/samples/asteric-sample-import.csv" download>Download sample CSV</a>
          </Card>
        </div>
      </div>
    </>
  );
}
