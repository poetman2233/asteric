import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pageOrgContext } from "@/server/auth/session";
import { getInbox } from "@/server/services/workflow";
import { InboxList } from "@/components/app/InboxList";
import { Card, Empty, PageHead } from "@/components/ui/Blocks";
import { RULE_TYPES } from "@/lib/rules";
import { num } from "@/lib/format";

export const metadata: Metadata = { title: "Decision Inbox" };

export default async function InboxPage() {
  const ctx = await pageOrgContext("/app");
  if (!ctx.org.isDemo && ctx.can("org.manage") && !ctx.org.onboardingCompletedAt) redirect("/app/onboarding");
  const { items, hidden, workflow, portfolio } = await getInbox(ctx);
  const matters = new Set(items.map((i) => i.matterId)).size;
  const activeRules = workflow.rules.filter((r) => r.active);

  if (!portfolio.facts.length) {
    return (
      <>
        <PageHead title="Decision Inbox" sub="Matters that deserve a review appear here." />
        <Empty title="No matters yet" actions={[{ href: "/app/imports/new", label: "Import matters", primary: true }, ...(ctx.can("matters.edit") ? [{ href: "/app/matters/new", label: "Add a matter" }] : [])]}>
          Once matters are in Asteric, this inbox lists the ones whose facts have moved away from your firm&apos;s assessments, the developments worth a fresh look, and matters that meet your firm&apos;s review rules.
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageHead title="Decision Inbox" sub={items.length ? `${num(matters)} matter${matters === 1 ? "" : "s"} deserve review` : "Nothing needs review right now."} />
      <div className="split">
        <div>
          {items.length ? <InboxList items={items} members={workflow.members} canAct={ctx.can("inbox.act")} viewerId={ctx.user.id} /> : (
            <Empty title="All caught up">No open matter has moved away from its latest assessment, and nothing meets your firm&apos;s review rules.</Empty>
          )}
          {hidden.length ? <p className="help" style={{ marginTop: 14 }}>{num(hidden.length)} item{hidden.length === 1 ? " is" : "s are"} snoozed, dismissed or confirmed. Every action is recorded in the audit log.</p> : null}
        </div>
        <div className="stack-lg">
          <Card title="Your firm's review rules" actions={<Link className="link" href="/app/rules" style={{ fontSize: 12.5 }}>Manage</Link>}>
            {activeRules.length ? (
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }} className="stack-sm">
                {activeRules.map((r) => <li key={r.id}><div style={{ fontWeight: 500, fontSize: 13 }}>{r.name}</div><div className="help">{RULE_TYPES[r.type].describe(r.params)}</div></li>)}
              </ul>
            ) : <p className="muted" style={{ fontSize: 13 }}>No rules yet. Rules are created by your firm, often from a Firm Learning finding.</p>}
          </Card>
          <Card title="How items arrive">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }} className="stack-sm ink2">
              <li><b>Decision moments:</b> offers, mediation, discovery, rulings and other developments you record.</li>
              <li><b>Drift:</b> expenses or duration moving past the latest assessment.</li>
              <li><b>Firm rules:</b> criteria your managing partners set.</li>
            </ul>
            <p className="help" style={{ marginTop: 12 }}>Asteric compares each matter with your firm&apos;s own assessments. It does not evaluate the merits or recommend a course of action.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
