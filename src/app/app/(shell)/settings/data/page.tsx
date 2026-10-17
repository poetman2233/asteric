import type { Metadata } from "next";
import { pageOrgContext } from "@/server/auth/session";
import { Card, Empty } from "@/components/ui/Blocks";
import { DeleteOrgForm } from "@/components/app/SettingsForms";
import { date } from "@/lib/format";

export const metadata: Metadata = { title: "Data" };

const EXPORTS = [
  { kind: "matters", label: "Matters", sub: "One row per matter with category, attorney, referral source, dates, status and financials." },
  { kind: "predictions", label: "Predictions", sub: "Every prediction version, including author, timestamp and revision reason." },
  { kind: "outcomes", label: "Outcomes", sub: "Resolution, gross recovery, fees, expenses and net to client." },
  { kind: "events", label: "Procedural events and offers", sub: "The full timeline of each matter." },
  { kind: "audit", label: "Audit log", sub: "Every recorded change and security event." },
];

export default async function DataPage() {
  const ctx = await pageOrgContext("/app/settings/data");
  if (!ctx.can("data.export") && !ctx.can("org.delete")) return <Empty title="Not available for your role">Data export and deletion are available to owners and administrators.</Empty>;
  const scheduled = ctx.org.deletionRequestedAt ? date(new Date(ctx.org.deletionRequestedAt.getTime() + 30 * 86400_000)) : null;
  return (
    <div className="stack-lg">
      {ctx.can("data.export") ? (
        <Card title="Export your data" sub="CSV files you can open in Excel. Exports are recorded in the audit log." pad={false}>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
            <table className="table"><tbody>{EXPORTS.map((e) => (
              <tr key={e.kind}><td style={{ whiteSpace: "normal" }}><div className="cell-primary">{e.label}</div><span className="cell-sub">{e.sub}</span></td><td className="r"><a className="btn btn-secondary btn-sm" href={`/app/export/${e.kind}`}>Download CSV</a></td></tr>
            ))}</tbody></table>
          </div>
        </Card>
      ) : null}
      {ctx.can("org.delete") && !ctx.org.isDemo ? <Card title="Delete organization"><DeleteOrgForm orgName={ctx.org.name} scheduledFor={scheduled} /></Card> : null}
    </div>
  );
}
