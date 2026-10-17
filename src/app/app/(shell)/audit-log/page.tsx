import type { Metadata } from "next";
import Link from "next/link";
import { pageOrgContext } from "@/server/auth/session";
import { AUDIT_PAGE, listAuditEvents } from "@/server/services/audit-log";
import { SelectParam } from "@/components/app/UrlControls";
import { Card, Empty, PageHead } from "@/components/ui/Blocks";
import { dateTime, num } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };

const PREFIXES = [
  { value: "", label: "All activity" }, { value: "prediction", label: "Predictions" }, { value: "outcome", label: "Outcomes" }, { value: "matter", label: "Matter changes" },
  { value: "import", label: "Imports" }, { value: "member", label: "Team" }, { value: "invitation", label: "Invitations" }, { value: "auth", label: "Sign-in and security" },
  { value: "organization", label: "Organization" }, { value: "export", label: "Exports" },
];

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageOrgContext("/app/audit-log");
  if (!ctx.can("audit.view")) return <><PageHead title="Audit log" /><Empty title="Not available for your role">The audit log is visible to owners and administrators.</Empty></>;
  const sp = await searchParams;
  const prefix = PREFIXES.some((p) => p.value === sp.type) ? sp.type ?? null : null;
  const page = Math.max(1, Number(sp.page) || 1);
  const { total, rows } = await listAuditEvents(ctx, { page, prefix });
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE));
  const qs = (n: number) => `?${new URLSearchParams({ ...(prefix ? { type: prefix } : {}), page: String(n) })}`;

  return (
    <>
      <PageHead title="Audit log" sub="An append-only record of changes and security events in this organization. Entries cannot be edited or deleted." />
      <Card pad={false} title={`${num(total)} events`} actions={<SelectParam param="type" label="Event type" options={PREFIXES} />}>
        <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table className="table">
            <caption className="sr-only">Audit events, newest first</caption>
            <thead><tr><th>When</th><th>Actor</th><th>Event</th><th>Summary</th></tr></thead>
            <tbody>
              {rows.length ? rows.map((r) => (
                <tr key={r.id}>
                  <td className="num ink2">{dateTime(r.createdAt, ctx.org.timezone)}</td>
                  <td>{r.actorLabel}</td>
                  <td><span className="mono" style={{ fontSize: 12 }}>{r.action}</span></td>
                  <td style={{ whiteSpace: "normal" }}>{r.objectType === "matter" && r.objectId ? <Link className="link" href={`/app/matters/${r.objectId}`}>{r.summary}</Link> : r.summary}</td>
                </tr>
              )) : <tr><td colSpan={4} className="muted" style={{ padding: 28, textAlign: "center" }}>No events.</td></tr>}
            </tbody>
          </table>
          <div className="table-foot">
            <span>Times shown in {ctx.org.timezone}</span>
            <span className="row" style={{ gap: 8 }}>
              {page > 1 ? <Link className="btn btn-secondary btn-sm" href={`/app/audit-log${qs(page - 1)}`}>Newer</Link> : null}
              <span>Page {page} of {pages}</span>
              {page < pages ? <Link className="btn btn-secondary btn-sm" href={`/app/audit-log${qs(page + 1)}`}>Older</Link> : null}
            </span>
          </div>
        </div>
      </Card>
    </>
  );
}
