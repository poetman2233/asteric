import type { Metadata } from "next";
import Link from "next/link";
import { pageOrgContext } from "@/server/auth/session";
import { loadPortfolio } from "@/server/services/portfolio";
import { applyFilter, filterToQuery, parseFilter } from "@/lib/analytics/filters";
import { MISSING_PREDICATE } from "@/lib/analytics/quality";
import { latestPrediction } from "@/lib/analytics/watch";
import { VALUE_BANDS } from "@/lib/analytics/accuracy";
import { RESOLUTION_LABEL } from "@/lib/taxonomy";
import { FilterBar } from "@/components/app/FilterBar";
import { SearchBox } from "@/components/app/UrlControls";
import { Empty, PageHead } from "@/components/ui/Blocks";
import { date, num, pct, range, usd } from "@/lib/format";
import type { MatterFact } from "@/lib/analytics/types";

export const metadata: Metadata = { title: "Matters" };

const PAGE = 50;
type SortKey = "name" | "opened" | "attorney" | "category" | "prob" | "value" | "expenses" | "gross" | "resolved";
const SORTS: Record<SortKey, (m: MatterFact) => string | number | null> = {
  name: (m) => m.name.toLowerCase(),
  opened: (m) => m.openedOn,
  attorney: (m) => m.attorneyName?.toLowerCase() ?? null,
  category: (m) => m.categoryLabel?.toLowerCase() ?? null,
  prob: (m) => latestPrediction(m)?.probability ?? null,
  value: (m) => { const p = latestPrediction(m); return p ? (p.recoveryLow + p.recoveryHigh) / 2 : null; },
  expenses: (m) => m.outcome?.litigationExpenses ?? m.expensesToDate,
  gross: (m) => m.outcome?.grossRecovery ?? null,
  resolved: (m) => m.outcome?.resolvedOn ?? null,
};

const MISSING_LABEL: Record<string, string> = {
  outcome: "No outcome recorded", gross_recovery: "No gross recovery", attorney_fee: "No attorney fee", expenses: "No litigation expenses", hours: "No attorney hours",
  category: "No category", attorney: "No lead attorney", referral: "No referral source", opened: "No date opened", historical_predictions: "No prediction before resolution", prospective_coverage: "No current prediction",
};

export default async function MattersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageOrgContext("/app/matters");
  const sp = await searchParams;
  const f = parseFilter(sp);
  const p = await loadPortfolio(ctx.org.id);
  let ms = applyFilter(p.facts, f);
  const missing = sp.missing && MISSING_PREDICATE[sp.missing] ? sp.missing : null;
  if (missing) ms = ms.filter(MISSING_PREDICATE[missing]!);

  const sort = (sp.sort && sp.sort in SORTS ? sp.sort : "opened") as SortKey;
  const dir = sp.dir === "asc" ? 1 : sp.dir === "desc" ? -1 : sort === "name" || sort === "attorney" || sort === "category" ? 1 : -1;
  const key = SORTS[sort];
  ms = [...ms].sort((a, b) => {
    const x = key(a), y = key(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  const pages = Math.max(1, Math.ceil(ms.length / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const rows = ms.slice((page - 1) * PAGE, page * PAGE);

  const baseQuery = { ...f, missing: missing ?? undefined } as Record<string, string | undefined>;
  const href = (extra: Record<string, string | undefined>) => `/app/matters${filterToQuery({}, { ...baseQuery, sort: sp.sort, dir: sp.dir, ...extra })}`;
  const sortHref = (k: SortKey) => href({ sort: k, dir: sort === k ? (dir === 1 ? "desc" : "asc") : undefined, page: undefined });
  const Th = ({ k, children, r }: { k: SortKey; children: React.ReactNode; r?: boolean }) => (
    <th className={r ? "r" : undefined} aria-sort={sort === k ? (dir === 1 ? "ascending" : "descending") : undefined}>
      <Link href={sortHref(k)} scroll={false} style={{ color: "inherit" }}>{children}{sort === k ? <span className="sort-ind" aria-hidden="true">{dir === 1 ? "↑" : "↓"}</span> : null}</Link>
    </th>
  );
  const band = f.band ? VALUE_BANDS.find((b) => b.key === f.band) : null;
  const chips = [
    band ? `Initial predicted value ${band.label} (favorable outcomes)` : null,
    f.pbin ? `Initial probability ${f.pbin.split("-").map((x) => pct(Number(x))).join("–")}` : null,
    missing ? MISSING_LABEL[missing] ?? missing : null,
  ].filter(Boolean) as string[];

  if (!p.facts.length) {
    return (
      <>
        <PageHead title="Matters" sub="Every matter, its recorded predictions and what happened." />
        <Empty title="No matters yet" actions={[{ href: "/app/imports/new", label: "Import matters", primary: true }, ...(ctx.can("matters.edit") ? [{ href: "/app/matters/new", label: "Add a matter" }] : [])]}>Import an export from your case management system, or add matters one at a time as they come in.</Empty>
      </>
    );
  }

  return (
    <>
      <PageHead title="Matters" sub="Every matter, its recorded predictions and what happened."
        actions={<>{ctx.can("data.export") ? <a className="btn btn-secondary" href={`/app/export/matters${filterToQuery(f)}`}>Export CSV</a> : null}{ctx.can("matters.edit") && !ctx.org.isDemo ? <Link className="btn btn-primary" href="/app/matters/new">New matter</Link> : null}</>} />
      {sp.hint === "record" ? <div className="alert alert-info" style={{ marginBottom: 14 }}><span>Choose an open matter to record or revise its prediction.</span></div> : null}
      <FilterBar options={{ categories: p.categories, attorneys: p.attorneys, referrals: p.referrals, jurisdictions: p.jurisdictions }} extra={<SearchBox />} />
      {chips.length ? (
        <div className="row-wrap" style={{ marginBottom: 12 }}>
          {chips.map((c) => <span key={c} className="filter-chip">{c}</span>)}
          <Link className="link" style={{ fontSize: 12.5 }} href={`/app/matters${filterToQuery({ ...f, band: undefined, pbin: undefined })}`}>Remove</Link>
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">Matters, sorted by {sort}</caption>
          <thead>
            <tr>
              <Th k="name">Matter</Th>
              <Th k="category">Category</Th>
              <Th k="attorney">Lead attorney</Th>
              <th>Referral source</th>
              <Th k="opened">Opened</Th>
              <th>Status</th>
              <Th k="value" r>Latest prediction</Th>
              <Th k="expenses" r>Expenses</Th>
              <Th k="gross" r>Recovery</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((m) => {
              const lp = latestPrediction(m);
              return (
                <tr key={m.id} className="clickable">
                  <td>
                    <Link href={`/app/matters/${m.id}`} className="cell-primary" style={{ display: "block" }}>{m.name}</Link>
                    <span className="cell-sub mono">{m.externalId ?? "—"}</span>
                  </td>
                  <td className="ink2">{m.categoryLabel ?? <span className="muted">Uncategorized</span>}</td>
                  <td className="ink2">{m.attorneyName ?? <span className="muted">Unassigned</span>}</td>
                  <td className="ink2" style={{ maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis" }}>{m.referralName ?? <span className="muted">—</span>}</td>
                  <td className="num ink2">{date(m.openedOn)}</td>
                  <td>
                    {m.status === "open"
                      ? <span className="badge badge-accent">Open{m.proceduralStage ? ` · ${m.proceduralStage}` : ""}</span>
                      : <span className="badge">{m.outcome ? RESOLUTION_LABEL[m.outcome.resolutionType] ?? "Closed" : "Closed"}</span>}
                  </td>
                  <td className="r">
                    {lp ? range(lp.recoveryLow, lp.recoveryHigh) : <span className="muted">None recorded</span>}
                    {lp ? <span className="cell-sub" style={{ display: "block" }}>{pct(lp.probability)} favorable{lp.source === "historical" ? " · historical" : lp.source === "sandbox" ? " · sandbox" : ""}</span> : null}
                  </td>
                  <td className="r">{usd(m.outcome?.litigationExpenses ?? m.expensesToDate)}</td>
                  <td className="r">{m.outcome ? (m.outcome.favorable ? usd(m.outcome.grossRecovery) : <span className="muted">No recovery</span>) : <span className="muted">—</span>}</td>
                </tr>
              );
            }) : (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: "center" }} className="muted">No matters match these filters.</td></tr>
            )}
          </tbody>
        </table>
        <div className="table-foot">
          <span>{num(ms.length)} matter{ms.length === 1 ? "" : "s"}{ms.length !== p.facts.length ? ` of ${num(p.facts.length)}` : ""}</span>
          <span className="row" style={{ gap: 8 }}>
            {page > 1 ? <Link className="btn btn-secondary btn-sm" href={href({ page: String(page - 1) })} scroll={false}>Previous</Link> : null}
            <span>Page {page} of {pages}</span>
            {page < pages ? <Link className="btn btn-secondary btn-sm" href={href({ page: String(page + 1) })} scroll={false}>Next</Link> : null}
          </span>
        </div>
      </div>
    </>
  );
}
