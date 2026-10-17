import type { MatterFact } from "./types";
import { evaluationPrediction } from "./calibration";
import { VALUE_BANDS } from "./accuracy";

/**
 * Filters shared by every analytics surface and the matters list. Because insights link
 * to the matters list with these same parameters, an aggregate claim and the matters
 * that support it are always computed by the same code.
 */
export type PortfolioFilter = {
  category?: string;      // category key
  attorney?: string;      // attorney id
  referral?: string;      // referral source id
  jurisdiction?: string;
  status?: "open" | "closed";
  from?: string;          // YYYY-MM-DD, applied to `dateBasis`
  to?: string;
  dateBasis?: "opened" | "resolved";
  band?: string;          // predicted value band key (resolved, favorable)
  pbin?: string;          // probability bin "0.8-0.9" on the initial prediction (resolved)
  q?: string;             // free-text search
};

const FILTER_KEYS = ["category", "attorney", "referral", "jurisdiction", "status", "from", "to", "dateBasis", "band", "pbin", "q"] as const;

export function parseFilter(sp: Record<string, string | string[] | undefined>): PortfolioFilter {
  const f: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    if (s && s.length <= 200) f[k] = s;
  }
  const out = f as PortfolioFilter;
  if (out.status && out.status !== "open" && out.status !== "closed") delete out.status;
  if (out.dateBasis && out.dateBasis !== "opened" && out.dateBasis !== "resolved") delete out.dateBasis;
  if (out.from && !/^\d{4}-\d{2}-\d{2}$/.test(out.from)) delete out.from;
  if (out.to && !/^\d{4}-\d{2}-\d{2}$/.test(out.to)) delete out.to;
  return out;
}

export function filterToQuery(f: PortfolioFilter, extra: Record<string, string | undefined> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, ...extra })) if (v) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function applyFilter(ms: MatterFact[], f: PortfolioFilter): MatterFact[] {
  const q = f.q?.trim().toLowerCase();
  let pbin: [number, number] | null = null;
  if (f.pbin) {
    const [a, b] = f.pbin.split("-").map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) pbin = [a!, b!];
  }
  const band = f.band ? VALUE_BANDS.find((b) => b.key === f.band) : undefined;
  return ms.filter((m) => {
    if (f.category && (m.categoryKey ?? "__none") !== f.category) return false;
    if (f.attorney && (m.attorneyId ?? "__none") !== f.attorney) return false;
    if (f.referral && (m.referralId ?? "__none") !== f.referral) return false;
    if (f.jurisdiction && (m.jurisdiction ?? "__none") !== f.jurisdiction) return false;
    if (f.status && m.status !== f.status) return false;
    if (f.from || f.to) {
      const d = f.dateBasis === "resolved" ? m.outcome?.resolvedOn : m.openedOn;
      if (!d) return false;
      if (f.from && d < f.from) return false;
      if (f.to && d > f.to) return false;
    }
    if (pbin) {
      const p = evaluationPrediction(m, "initial");
      if (!p || p.probability < pbin[0] || (p.probability >= pbin[1] && !(pbin[1] >= 1 && p.probability <= 1))) return false;
    }
    if (band) {
      const p = evaluationPrediction(m, "initial");
      if (!p || !m.outcome?.favorable || m.outcome.grossRecovery == null) return false;
      const mid = (p.recoveryLow + p.recoveryHigh) / 2;
      if (mid < band.lo || mid >= band.hi) return false;
    }
    if (q) {
      const hay = [m.name, m.externalId, m.attorneyName, m.categoryLabel, m.referralName, m.jurisdiction].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
