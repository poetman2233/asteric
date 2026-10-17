import type { Metadata } from "next";
import Link from "next/link";
import { pageOrgContext } from "@/server/auth/session";
import { loadPortfolio } from "@/server/services/portfolio";
import { applyFilter, filterToQuery, parseFilter } from "@/lib/analytics/filters";
import { brierScore, calibration, forecastPairs, MIN_CALIBRATION_N, type Basis } from "@/lib/analytics/calibration";
import { durationItems, durationSummary, expenseItems, expenseSummary, rangeByBand, rangeItems, rangeSummary, revisionSummary } from "@/lib/analytics/accuracy";
import { FilterBar } from "@/components/app/FilterBar";
import { SegParam } from "@/components/app/UrlControls";
import { Card, Empty, Kpi, PageHead } from "@/components/ui/Blocks";
import { MethodologyButton } from "@/components/ui/Methodology";
import { CalibrationChart, HBarChart, Histogram } from "@/components/charts/Charts";
import { num, pct, signedMonths, signedPct } from "@/lib/format";
import type { MatterFact } from "@/lib/analytics/types";

export const metadata: Metadata = { title: "Calibration" };

const MIN_GROUP = 20;

/** The first and last bins also hold values beyond the outer edges. */
function histBins(h: { from: number; to: number; count: number }[], unit: string) {
  const s = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x)}${unit}`;
  return h.map((b, i) => ({ label: i === 0 ? `<${s(b.to)}` : i === h.length - 1 ? `≥${s(b.from)}` : s(b.from), count: b.count }));
}

function brierBy(ms: MatterFact[], basis: Basis, hist: boolean, key: (m: MatterFact) => { id: string | null; label: string | null }) {
  const groups = new Map<string, { label: string; ms: MatterFact[] }>();
  for (const m of ms) {
    const k = key(m);
    if (!k.id) continue;
    const g = groups.get(k.id) ?? { label: k.label ?? "Unknown", ms: [] };
    g.ms.push(m);
    groups.set(k.id, g);
  }
  return [...groups.entries()].map(([id, g]) => {
    const pairs = forecastPairs(g.ms, basis, hist);
    return { id, label: g.label, n: pairs.length, brier: brierScore(pairs) };
  }).filter((x) => x.n > 0).sort((a, b) => (a.brier ?? 1) - (b.brier ?? 1));
}

export default async function CalibrationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await pageOrgContext("/app/calibration");
  const sp = await searchParams;
  const f = parseFilter(sp);
  const basis: Basis = sp.basis === "latest" ? "latest" : "initial";
  const hist = sp.hist !== "0";
  const p = await loadPortfolio(ctx.org.id);
  const ms = applyFilter(p.facts, { ...f, dateBasis: f.dateBasis ?? "resolved" }).filter((m) => m.outcome);
  const pairs = forecastPairs(ms, basis, hist);
  const cal = calibration(pairs);
  const range = rangeSummary(rangeItems(ms, basis));
  const bands = rangeByBand(rangeItems(ms, basis));
  const dur = durationSummary(durationItems(ms, basis));
  const exp = expenseSummary(expenseItems(ms, basis));
  const rev = revisionSummary(ms);
  const initialBrier = brierScore(forecastPairs(ms, "initial", hist));
  const latestBrier = brierScore(forecastPairs(ms, "latest", hist));
  const byAtt = brierBy(ms, basis, hist, (m) => ({ id: m.attorneyId, label: m.attorneyName }));
  const byCat = brierBy(ms, basis, hist, (m) => ({ id: m.categoryKey, label: m.categoryLabel }));
  const q = filterToQuery(f);
  const sample = `${num(cal.n)} resolved matters with a ${basis} prediction recorded before resolution${hist ? ", including historical estimates from imports" : ", prospective predictions only"}`;

  return (
    <>
      <PageHead title="Calibration" sub="How the firm's recorded probabilities and ranges compared with what actually happened." />
      <div className="row-wrap" style={{ marginBottom: 12, gap: 10 }}>
        <SegParam param="basis" label="Prediction evaluated" options={[{ value: "initial", label: "Initial prediction" }, { value: "latest", label: "Latest before resolution" }]} />
        <SegParam param="hist" label="Historical estimates" options={[{ value: "1", label: "Include historical" }, { value: "0", label: "Prospective only" }]} />
      </div>
      <FilterBar options={{ categories: p.categories, attorneys: p.attorneys, referrals: p.referrals, jurisdictions: p.jurisdictions }} show={{ category: true, attorney: true, referral: true, jurisdiction: true, dates: true }} dateBasisDefault="resolved" />

      {!cal.sufficient ? (
        <Empty title="Not enough resolved predictions yet" actions={[{ href: "/app/predictions", label: "View prediction coverage" }]}>
          Calibration needs at least {MIN_CALIBRATION_N} resolved matters with a prediction recorded before the outcome was known. This view has {cal.n}. Record predictions on open matters, or import historical intake estimates, to build the record.
        </Empty>
      ) : (
        <div className="stack-lg">
          <div className="kpis">
            <Kpi label="Brier score" value={cal.brier!.toFixed(3)} foot={`Lower is better · n = ${num(cal.n)}`} tip="Mean squared difference between the predicted probability and the outcome (1 favorable, 0 not). 0 is perfect; 0.25 is what always forecasting 50% would score." />
            <Kpi label="Base-rate reference" value={cal.referenceBrier!.toFixed(3)} foot={`Always forecasting ${pct(cal.baseRate)}`} tip="The Brier score the firm would get by giving every matter the same probability: the observed favorable rate." />
            <Kpi label="Skill vs base rate" value={signedPct(cal.skill)} foot={cal.skill! > 0 ? "More informative than the base rate" : "Not more informative than the base rate"} />
            <Kpi label="Range accuracy" value={range.n ? pct(range.within) : "—"} foot={`Recoveries inside the predicted range · n = ${num(range.n)}`} />
            <Kpi label="Duration error" value={dur.n ? signedMonths(dur.medianError) : "—"} foot={`Median, actual minus predicted · n = ${num(dur.n)}`} />
            <Kpi label="Expense error" value={exp.n ? signedPct(exp.medianPctError) : "—"} foot={`Median, actual vs predicted · n = ${num(exp.n)}`} />
          </div>

          <Card title="Calibration curve" sub={`Each point groups predictions in a 10-point probability band. Points on the diagonal mean that predicted probabilities matched observed rates.`} actions={<MethodologyButton id="calibration" sample={sample} />}>
            <div className="cols-2" style={{ gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", alignItems: "start" }}>
              <CalibrationChart points={cal.bins.filter((b) => b.n > 0).map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, meanPredicted: b.meanPredicted!, observed: b.observed!, ciLo: b.ci!.lo, ciHi: b.ci!.hi, sufficient: b.sufficient }))} />
              <div className="table-wrap" style={{ border: 0 }}>
                <table className="table table-compact">
                  <caption className="sr-only">Calibration by probability band</caption>
                  <thead><tr><th>Predicted</th><th className="r">n</th><th className="r">Mean predicted</th><th className="r">Observed</th><th className="r">95% interval</th></tr></thead>
                  <tbody>
                    {cal.bins.filter((b) => b.n > 0).map((b) => (
                      <tr key={b.lo}>
                        <td>{basis === "initial" ? <Link className="link" href={`/app/matters${filterToQuery(f, { status: "closed", pbin: `${b.lo.toFixed(1)}-${b.hi.toFixed(1)}` })}`}>{pct(b.lo)}–{pct(b.hi)}</Link> : `${pct(b.lo)}–${pct(b.hi)}`}</td>
                        <td className="r">{b.n}</td>
                        <td className="r">{pct(b.meanPredicted)}</td>
                        <td className="r">{b.sufficient ? pct(b.observed) : <span className="muted">{pct(b.observed)}*</span>}</td>
                        <td className="r ink2">{pct(b.ci!.lo)}–{pct(b.ci!.hi)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="help" style={{ padding: "8px 12px" }}>* Fewer than 5 predictions: shown for completeness, not reliable.</p>
              </div>
            </div>
          </Card>

          <div className="cols-2">
            <Card title="Brier score by lead attorney" sub={`Lower is better. Attorneys with fewer than ${MIN_GROUP} resolved predictions are shown in gray.`} actions={<MethodologyButton id="brier" sample={sample} />}>
              <HBarChart data={byAtt.map((a) => ({ key: a.id, label: a.label, value: a.brier, display: a.brier?.toFixed(3) ?? "—", muted: a.n < MIN_GROUP, detail: [["Resolved predictions", String(a.n)]] }))} format="brier" reference={cal.brier} referenceLabel="Firm" />
            </Card>
            <Card title="Brier score by category" sub={`Lower is better. Categories with fewer than ${MIN_GROUP} resolved predictions are shown in gray.`}>
              <HBarChart data={byCat.map((a) => ({ key: a.id, label: a.label, value: a.brier, display: a.brier?.toFixed(3) ?? "—", muted: a.n < MIN_GROUP, detail: [["Resolved predictions", String(a.n)]] }))} format="brier" reference={cal.brier} referenceLabel="Firm" />
            </Card>
          </div>

          <Card title="Recovery-range accuracy by predicted value" sub="Graded on favorable resolutions with a recorded gross recovery. The range is the expected recovery if the matter resolves favorably." actions={<MethodologyButton id="range" sample={`${num(range.n)} favorable resolutions with a recorded recovery and a ${basis} prediction`} />} pad={false}>
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="table">
                <caption className="sr-only">Range accuracy by predicted value band</caption>
                <thead><tr><th>Predicted midpoint</th><th className="r">n</th><th className="r">Inside range</th><th className="r">Below</th><th className="r">Above</th><th className="r">Median recovery ÷ midpoint</th><th /></tr></thead>
                <tbody>
                  {bands.map((b) => (
                    <tr key={b.key}>
                      <td>{b.label}</td>
                      <td className="r">{b.n}</td>
                      <td className="r">{b.n ? pct(b.within) : "—"}</td>
                      <td className="r">{b.n ? pct(b.below) : "—"}</td>
                      <td className="r">{b.n ? pct(b.above) : "—"}</td>
                      <td className="r">{b.medianRatio != null ? <span className={b.medianRatio < 0.8 ? "neg" : undefined}>{pct(b.medianRatio)}</span> : "—"}{b.n > 0 && b.n < 12 ? <span className="cell-sub" style={{ display: "block" }}>Small sample</span> : null}</td>
                      <td className="r">{b.n && basis === "initial" ? <Link className="link" href={`/app/matters${filterToQuery(f, { status: "closed", band: b.key })}`}>Matters</Link> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="cols-2">
            <Card title="Duration error" sub={`Actual total duration minus predicted, in months. Positive means the matter took longer. Median ${signedMonths(dur.medianError)}; ${pct(dur.shareLonger)} took longer than predicted.`} actions={<MethodologyButton id="duration" sample={`${num(dur.n)} resolved matters with a predicted duration`} />}>
              {dur.n ? <Histogram xLabel="Months longer (+) or shorter (−) than predicted · bars start at the value shown" bins={histBins(dur.histogram, "")} /> : <p className="muted">No resolved matters with a predicted duration in this view.</p>}
            </Card>
            <Card title="Expense error" sub={`Final litigation expense relative to the predicted expense. Median ${signedPct(exp.medianPctError)}; ${pct(exp.shareOver)} exceeded the forecast by more than 5%.`} actions={<MethodologyButton id="expense" sample={`${num(exp.n)} resolved matters with a predicted and final expense`} />}>
              {exp.n ? <Histogram xLabel="Percent over (+) or under (−) predicted expense · bars start at the value shown" bins={histBins(exp.histogram, "%")} /> : <p className="muted">No resolved matters with predicted and final expenses in this view.</p>}
            </Card>
          </div>

          <Card title="Revisions" sub="Whether updating predictions as matters progressed improved them.">
            <div className="stat-row">
              <div><div className="v">{num(rev.revised)}</div><div className="k">Matters revised at least once</div></div>
              <div><div className="v">{num(rev.revisions)}</div><div className="k">Revisions recorded</div></div>
              <div><div className="v">{initialBrier?.toFixed(3) ?? "—"}</div><div className="k">Brier, initial predictions</div></div>
              <div><div className="v">{latestBrier?.toFixed(3) ?? "—"}</div><div className="k">Brier, latest before resolution</div></div>
            </div>
            {initialBrier != null && latestBrier != null ? (
              <p className="help" style={{ marginTop: 10 }}>
                {latestBrier < initialBrier ? `Latest predictions scored ${(initialBrier - latestBrier).toFixed(3)} lower (better) than initial predictions on the same matters.` : "Latest predictions did not score better than initial predictions on these matters."} Matters without a revision contribute the same prediction to both.
              </p>
            ) : null}
          </Card>
        </div>
      )}
      <p className="help" style={{ marginTop: 20 }}>Historical association in your firm&apos;s records. Asteric does not provide legal advice. <Link className="link" href={`/app/matters${q}`}>View the matters in this view</Link></p>
    </>
  );
}
