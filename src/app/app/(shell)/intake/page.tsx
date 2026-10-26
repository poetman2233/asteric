import type { Metadata } from "next";
import { pageOrgContext } from "@/server/auth/session";
import { loadPortfolio } from "@/server/services/portfolio";
import { INTAKE_REASONS, listIntake } from "@/server/services/workflow";
import { IntakeForm } from "@/components/app/IntakeForm";
import { Card, PageHead } from "@/components/ui/Blocks";
import { LIKELIHOOD } from "@/lib/assessment";
import { date, num } from "@/lib/format";

export const metadata: Metadata = { title: "Intake decisions" };

export default async function IntakePage() {
  const ctx = await pageOrgContext("/app/intake");
  const p = await loadPortfolio(ctx.org.id);
  const rows = await listIntake(ctx);
  const reason = Object.fromEntries(INTAKE_REASONS.map((r) => [r.key, r.label]));
  const lk = Object.fromEntries(LIKELIHOOD.map((l) => [l.key, l.label]));
  return (
    <>
      <PageHead title="Intake decisions" sub="A light record of matters the firm declined or referred out, so the firm's learning is not limited to the cases it accepted. No matter file is needed." />
      <div className="split">
        <Card title={`${num(rows.length)} recorded`} pad={false}>
          <div className="table-wrap" style={{ border: 0, borderRadius: 0, maxHeight: "70vh" }}>
            <table className="table">
              <caption className="sr-only">Declined and referred intake decisions</caption>
              <thead><tr><th>Date</th><th>Decision</th><th>Category</th><th>Reason</th><th>Referral source</th><th>Attorney</th><th>Likelihood</th></tr></thead>
              <tbody>{rows.length ? rows.map(({ i, category, referral, attorney }) => (
                <tr key={i.id}>
                  <td className="num ink2">{date(i.receivedOn)}</td>
                  <td><span className="badge">{i.disposition === "rejected" ? "Declined" : "Referred out"}</span></td>
                  <td>{category ?? "—"}</td>
                  <td className="ink2">{reason[i.reasonCode] ?? i.reasonCode}</td>
                  <td className="ink2">{referral ?? "—"}</td>
                  <td className="ink2">{attorney ?? i.decidedLabel}</td>
                  <td className="ink2">{i.likelihood ? lk[i.likelihood] ?? i.likelihood : "—"}</td>
                </tr>
              )) : <tr><td colSpan={7} className="muted" style={{ padding: 24, textAlign: "center" }}>Nothing recorded yet.</td></tr>}</tbody>
            </table>
          </div>
        </Card>
        {ctx.can("intake.record") ? (
          <Card title="Record a declined or referred matter">
            <IntakeForm categories={p.categories} referrals={p.referrals.map((r) => ({ key: r.id, label: r.name }))} attorneys={p.attorneys.map((a) => ({ key: a.id, label: a.name }))} reasons={INTAKE_REASONS.map((r) => ({ key: r.key, label: r.label }))} defaultAttorney={ctx.attorneyId} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
