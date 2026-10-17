import type { Metadata } from "next";
import { pageOrgContext } from "@/server/auth/session";
import { loadPortfolio } from "@/server/services/portfolio";
import { economicsBy } from "@/lib/analytics/economics";
import { durationItems, durationSummary } from "@/lib/analytics/accuracy";
import { Card, PageHead } from "@/components/ui/Blocks";
import { months, num, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Network preview" };

/** Minimum number of contributing firms before any network figure would be shown. */
const NETWORK_MIN_FIRMS = 5;

export default async function NetworkPage() {
  const ctx = await pageOrgContext("/app/network");
  const p = await loadPortfolio(ctx.org.id);
  const s = ctx.org.settings;
  const a = { attorneyHourlyCost: s.attorneyHourlyCost, defaultContingencyRate: s.defaultContingencyRate, expensesReimbursedFromRecovery: s.expensesReimbursedFromRecovery };
  const byCat = economicsBy(p.facts, "category", a).filter((g) => g.resolved >= 10).sort((x, y) => y.resolved - x.resolved);

  return (
    <>
      <PageHead title={<>Network <span className="badge" style={{ verticalAlign: "middle", marginLeft: 6 }}>Preview</span></>} sub="A planned, opt-in way for firms to compare their own patterns against anonymized aggregates. It is not active." />
      <div className="stack-lg">
        <div className="alert alert-info">
          <span><strong>No network data exists yet.</strong> Asteric does not currently share, pool or benchmark any firm&apos;s data, and nothing on this page comes from another firm. Your organization&apos;s status: <strong>{s.networkParticipation === "not_enrolled" ? "Not enrolled" : s.networkParticipation}</strong>.</span>
        </div>

        <Card title="How it would work">
          <ol style={{ margin: 0, paddingLeft: 20 }} className="stack-sm">
            <li><strong>Opt-in only.</strong> An owner would have to enroll the organization explicitly, and could withdraw at any time.</li>
            <li><strong>Derived signals, not records.</strong> Only aggregate statistics would leave your workspace (for example, median duration for retaliation matters in a jurisdiction). No matter names, client identities, notes, documents or individual figures.</li>
            <li><strong>Minimum group sizes.</strong> No figure would be shown unless it combined at least {NETWORK_MIN_FIRMS} firms and enough matters that no single firm could be identified.</li>
            <li><strong>Separate storage.</strong> Derived signals are kept in a separate database schema with no link back to an organization.</li>
          </ol>
        </Card>

        <Card title="What your firm would contribute" sub="Computed from your records only. This is the kind of aggregate that would be shared if you enrolled; it is not shared today." pad={false}>
          {byCat.length ? (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="table">
                <caption className="sr-only">Your firm&apos;s aggregate signals by category</caption>
                <thead><tr><th>Category</th><th className="r">Resolved matters</th><th className="r">Favorable rate</th><th className="r">Median duration</th><th className="r">Median duration error</th><th>Network comparison</th></tr></thead>
                <tbody>
                  {byCat.map((g) => {
                    const d = durationSummary(durationItems(p.facts.filter((m) => m.outcome && (m.categoryKey ?? "__none") === g.key)));
                    return (
                      <tr key={g.key}>
                        <td className="cell-primary">{g.label}</td>
                        <td className="r">{num(g.resolved)}</td>
                        <td className="r">{pct(g.favorableRate)}</td>
                        <td className="r">{months(g.medianDuration)}</td>
                        <td className="r">{d.n >= 10 ? `${d.medianError! >= 0 ? "+" : ""}${months(d.medianError)}` : "—"}</td>
                        <td className="muted">Not available</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="card-body muted">Your firm does not yet have 10 resolved matters in any category.</div>}
        </Card>
        <p className="help">If you are interested in participating once the network is available, tell us through the contact page. Enrollment will require a separate written agreement.</p>
      </div>
    </>
  );
}
