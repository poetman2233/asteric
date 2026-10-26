import type { Metadata } from "next";
import { pageOrgContext } from "@/server/auth/session";
import { getInbox } from "@/server/services/workflow";
import { RuleForm, RuleRowActions } from "@/components/app/RulesEditor";
import { Card, PageHead } from "@/components/ui/Blocks";
import { RULE_TYPES, templateForInsight } from "@/lib/rules";
import { date, num } from "@/lib/format";

export const metadata: Metadata = { title: "Review rules" };

export default async function RulesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageOrgContext("/app/rules");
  const sp = await searchParams;
  const { items, workflow, portfolio } = await getInbox(ctx);
  const labels = { categories: Object.fromEntries(portfolio.categories.map((c) => [c.key, c.label])), referrals: Object.fromEntries(portfolio.referrals.map((r) => [r.id, r.name])) };
  const tpl = sp.template ? templateForInsight(sp.template, labels) : null;
  const matchCount = (id: string) => new Set(items.filter((i) => i.ruleId === id).map((i) => i.matterId)).size;
  const canManage = ctx.can("rules.manage");
  return (
    <>
      <PageHead title="Review rules" sub="Internal operating rules set by your firm. When a matter meets one, it appears in the Decision Inbox with the rule that applies. Asteric evaluates the criteria; your firm decides what they are." />
      <div className="split">
        <Card title={`Rules (${workflow.rules.length})`} pad={false}>
          {workflow.rules.length ? (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="table">
                <caption className="sr-only">Review rules</caption>
                <thead><tr><th>Rule</th><th className="r">Matching now</th><th>Created</th><th /></tr></thead>
                <tbody>{workflow.rules.map((r) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: "normal" }}><div className="cell-primary" style={{ maxWidth: "none" }}>{r.name}</div><span className="cell-sub">{RULE_TYPES[r.type].describe(r.params)}{r.sourceInsight ? " · from a Firm Learning finding" : ""}</span></td>
                    <td className="r">{r.active ? num(matchCount(r.id)) : "—"}</td>
                    <td className="ink2">{date(r.createdAt)}<span className="cell-sub" style={{ display: "block" }}>{r.createdByLabel}</span></td>
                    <td className="r"><RuleRowActions id={r.id} active={r.active} canManage={canManage} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <div className="card-body muted">No rules yet. Create one here, or from a finding in Firm Learning.</div>}
        </Card>
        {canManage ? (
          <Card title={tpl ? "Create rule from finding" : "New rule"}>
            <RuleForm initial={tpl ? { ...tpl, sourceInsight: sp.template! } : null} categories={portfolio.categories} referrals={portfolio.referrals.map((r) => ({ key: r.id, label: r.name }))} />
          </Card>
        ) : <Card title="New rule"><p className="muted" style={{ fontSize: 13 }}>Owners and administrators create review rules.</p></Card>}
      </div>
    </>
  );
}
