/**
 * Synthetic demonstration dataset for "Keller & Ross Employment Law".
 *
 * Every matter is generated from one latent model so that outcome, duration,
 * expenses, offers, events and predictions cohere. Patterns are produced by the
 * generating process (biases in how predictions relate to reality), not written
 * into analytics output:
 *   • the firm is calibrated up to ~70% and overconfident above it;
 *   • matters predicted at $1M+ recover far less than predicted;
 *   • "Pacific Labor Referral Group" brings large recoveries but long, expensive
 *     matters and a 40% referral-fee split, so its return on capital is weak;
 *   • Marco Rodriguez is well calibrated on probability but underestimates
 *     duration and expense;
 *   • retaliation matters run long; wage & hour matters overrun expense forecasts;
 *   • some open matters have drifted from their latest prediction.
 * Deterministic for a given seed and as-of date.
 */

export type DemoAttorney = { key: string; name: string; title: string };
export type DemoSource = { key: string; name: string; referralFeeShare: number };
export type DemoPrediction = {
  version: number; recordedOn: string; low: number; high: number; probability: number;
  durationMonths: number | null; expense: number | null; confidence: "low" | "medium" | "high" | null;
  drivers: string[]; reason: string | null; source: "prospective" | "historical"; stage: string;
};
export type DemoEvent = { type: string; on: string; title: string; amount?: number };
export type DemoOffer = { direction: "defense_offer" | "plaintiff_demand"; amount: number; on: string };
export type DemoOutcome = {
  resolutionType: string; favorable: boolean; resolvedOn: string; gross: number; fee: number; referralFee: number;
  expenses: number; netToClient: number; hours: number;
};
export type DemoMatter = {
  externalId: string; name: string; category: string; originalCategory: string; attorney: string; source: string | null;
  jurisdiction: string; court: string; openedOn: string; status: "open" | "closed"; stage: string;
  expensesToDate: number; hours: number; industry: string; size: string;
  predictions: DemoPrediction[]; events: DemoEvent[]; offers: DemoOffer[]; outcome: DemoOutcome | null; imported: boolean;
};

export const ATTORNEYS: DemoAttorney[] = [
  { key: "ross", name: "Jane Ross", title: "Partner" },
  { key: "keller", name: "Ana Keller", title: "Managing Partner" },
  { key: "rodriguez", name: "Marco Rodriguez", title: "Partner" },
  { key: "chen", name: "David Chen", title: "Senior Associate" },
  { key: "okafor", name: "Sofia Okafor", title: "Associate" },
  { key: "brennan", name: "Liam Brennan", title: "Associate" },
];
export const SOURCES: DemoSource[] = [
  { key: "bar", name: "Bar association referral service", referralFeeShare: 0.1 },
  { key: "former", name: "Former clients", referralFeeShare: 0 },
  { key: "web", name: "Web intake", referralFeeShare: 0 },
  { key: "pacific", name: "Pacific Labor Referral Group", referralFeeShare: 0.4 },
  { key: "meyer", name: "Meyer Lindqvist (co-counsel)", referralFeeShare: 0.33 },
  { key: "clinic", name: "Community legal clinic", referralFeeShare: 0 },
];
const CATEGORY_PROFILE: Record<string, { weight: number; value: number; duration: number; expense: number; durationBias: number; expenseBias: number; raw: string[] }> = {
  wrongful_termination: { weight: 20, value: 240_000, duration: 16, expense: 32_000, durationBias: 1.2, expenseBias: 1.04, raw: ["Wrongful Termination", "wrongful term.", "Wrongful discharge"] },
  retaliation: { weight: 18, value: 270_000, duration: 17, expense: 36_000, durationBias: 4.1, expenseBias: 1.06, raw: ["Retaliation", "FEHA retaliation", "term - retaliation", "Labor Code 1102.5 retaliation"] },
  discrimination: { weight: 16, value: 310_000, duration: 19, expense: 40_000, durationBias: 1.6, expenseBias: 1.05, raw: ["Discrimination", "Age Discrimination (ADEA)", "Race disc", "Pregnancy discrimination"] },
  harassment: { weight: 12, value: 250_000, duration: 15, expense: 30_000, durationBias: 1.0, expenseBias: 1.03, raw: ["Sexual harassment", "Hostile work environment", "Harassment"] },
  wage_hour: { weight: 12, value: 190_000, duration: 14, expense: 46_000, durationBias: 1.4, expenseBias: 1.33, raw: ["Wage/Hour", "OT / misclassification", "Unpaid wages", "Meal and rest breaks"] },
  disability_accommodation: { weight: 9, value: 210_000, duration: 15, expense: 31_000, durationBias: 1.3, expenseBias: 1.05, raw: ["Disability - failure to accommodate", "ADA accommodation"] },
  whistleblower: { weight: 7, value: 380_000, duration: 21, expense: 52_000, durationBias: 2.0, expenseBias: 1.08, raw: ["Whistleblower", "Whistleblower 1102.5", "SOX whistleblower"] },
  leave: { weight: 6, value: 150_000, duration: 12, expense: 24_000, durationBias: 0.9, expenseBias: 1.02, raw: ["FMLA interference", "CFRA leave", "Medical leave"] },
};
const PLAINTIFFS = ["Okonkwo", "Alvarez", "Chen", "Delgado", "Pierre", "Whitmore", "Nguyen", "Patel", "Haddad", "Kowalski", "Moreau", "Ibarra", "Lindqvist", "Abara", "Sato", "Fischer", "Mensah", "Ortega", "Brandt", "Castillo", "Quinn", "Romero", "Takahashi", "Vasquez", "Hollis", "Akhtar", "Bianchi", "Duarte", "Ekwueme", "Farrow", "Gallo", "Herrera", "Iyer", "Jansen", "Kaur", "Laurent", "Marsh", "Novak", "Osei", "Park", "Reyes", "Sorensen", "Tran", "Underwood", "Varga", "Wiley", "Yilmaz", "Zamora"];
const DEFENDANTS = ["Meridian Logistics", "Brightwave Health", "Northgate Systems", "Corepoint Manufacturing", "Halden Retail Group", "Ansel Capital", "Foundry Robotics", "Vantage Freight", "Larkspur Hotels", "Cobalt Data", "Summit Grocers", "Redwood Transit", "Pinecrest Medical", "Atlas Security Services", "Bayline Telecom", "Crestview Senior Living", "Delta Coast Marine", "Evergreen Property Management", "Fairmont Staffing", "Granite Peak Construction", "Harborview Restaurants", "Ironwood Software", "Juniper Pharmacy", "Keystone Insurance Brokers", "Lumen Biotech", "Mariposa Schools", "Nova Auto Group", "Orchard Valley Farms", "Pacifica Credit Union", "Quarry Lane Logistics", "Riverside Hospital District", "Sierra Fitness Clubs"];
const INDUSTRIES = ["Logistics", "Healthcare", "Technology", "Manufacturing", "Retail", "Financial services", "Hospitality", "Construction", "Education", "Transportation"];
const SIZES = ["50–199", "200–999", "1,000–4,999", "5,000+"];
const COURTS: [string, string][] = [["CA", "Los Angeles County Superior Court"], ["CA", "San Francisco County Superior Court"], ["CA", "Orange County Superior Court"], ["CA", "C.D. Cal."], ["CA", "Alameda County Superior Court"], ["CA", "JAMS arbitration"]];

const MAJOR = new Set(["complaint_filed", "discovery_closed", "deposition", "motion_decided", "mediation_held", "expert_retained", "trial_set", "settlement_conference"]);

/* ------------------------------------------------------------------ deterministic randomness */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The dataset is generated against a fixed calendar, then shifted so it always ends "today". */
export const DEMO_ANCHOR = "2026-10-17";
export const DEMO_SEED = 20190152;

export function generateDemo(opts: { seed?: number; asOf: string; count?: number }): { matters: DemoMatter[] } {
  const { matters } = generateAnchored({ seed: opts.seed ?? DEMO_SEED, asOf: DEMO_ANCHOR, count: opts.count });
  const shiftDays = Math.round((Date.parse(`${opts.asOf}T00:00:00Z`) - Date.parse(`${DEMO_ANCHOR}T00:00:00Z`)) / 86400_000);
  if (!shiftDays) return { matters };
  const sh = (d: string) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + shiftDays); return x.toISOString().slice(0, 10); };
  return {
    matters: matters.map((m) => ({
      ...m, openedOn: sh(m.openedOn),
      predictions: m.predictions.map((p) => ({ ...p, recordedOn: sh(p.recordedOn) })),
      events: m.events.map((e) => ({ ...e, on: sh(e.on) })),
      offers: m.offers.map((o) => ({ ...o, on: sh(o.on) })),
      outcome: m.outcome ? { ...m.outcome, resolvedOn: sh(m.outcome.resolvedOn) } : null,
    })),
  };
}

function generateAnchored(opts: { seed: number; asOf: string; count?: number }): { matters: DemoMatter[] } {
  const rnd = mulberry32(opts.seed);
  const u = (a: number, b: number) => a + (b - a) * rnd();
  const normal = () => { let x = 0; for (let i = 0; i < 6; i++) x += rnd(); return (x - 3) / Math.sqrt(0.5); };
  const logn = (median: number, sigma: number) => median * Math.exp(sigma * normal());
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
  const weighted = <T,>(items: [T, number][]) => { const t = items.reduce((a, [, w]) => a + w, 0); let r = rnd() * t; for (const [v, w] of items) { r -= w; if (r <= 0) return v; } return items[items.length - 1]![0]; };
  const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
  const round = (x: number, step: number) => Math.round(x / step) * step;
  const asOf = new Date(`${opts.asOf}T00:00:00Z`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const addMonths = (d: string, m: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + Math.round(m * 30.4375)); return iso(x); };
  const start = new Date("2019-01-07T00:00:00Z").getTime();
  const end = asOf.getTime() - 25 * 86400_000;
  const count = opts.count ?? 720;

  const matters: DemoMatter[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < count; i++) {
    const category = weighted(Object.entries(CATEGORY_PROFILE).map(([k, v]) => [k, v.weight]));
    const prof = CATEGORY_PROFILE[category]!;
    const attorney = weighted<DemoAttorney>([[ATTORNEYS[0]!, 22], [ATTORNEYS[1]!, 18], [ATTORNEYS[2]!, 20], [ATTORNEYS[3]!, 16], [ATTORNEYS[4]!, 13], [ATTORNEYS[5]!, 11]]);
    const source = rnd() < 0.08 ? null : weighted<DemoSource>([[SOURCES[0]!, 22], [SOURCES[1]!, 18], [SOURCES[2]!, 22], [SOURCES[3]!, 16], [SOURCES[4]!, 10], [SOURCES[5]!, 12]]);
    const isPacific = source?.key === "pacific";
    const opened = iso(new Date(start + (end - start) * Math.pow(rnd(), 0.92)));
    const prospective = opened >= "2023-01-01";

    // --- the attorney's belief at intake
    let p = clamp(0.64 + 0.2 * normal(), 0.12, 0.95);
    if (attorney.key === "keller") p = clamp(p + 0.06, 0.12, 0.96);
    // Rodriguez discriminates well: sharper forecasts that track reality.
    if (attorney.key === "rodriguez") p = clamp(0.55 + (p - 0.55) * 1.5, 0.1, 0.84);
    // Value: predicted midpoint. Pacific and whistleblower matters skew large.
    // A minority of matters are underwritten as high-value (catastrophic damages, executive plaintiffs).
    const highValue = rnd() < (isPacific ? 0.2 : 0.11);
    const mid = round(clamp(logn(prof.value * (isPacific ? 2.3 : 1) * (highValue ? 3.4 : 1), 0.62), 45_000, 6_000_000), 5_000);
    const low = round(mid * u(0.7, 0.8), 5_000), high = round(mid * u(1.2, 1.32), 5_000);
    const dPred = Math.max(5, Math.round(prof.duration + (isPacific ? 2 : 0) + normal() * 2.5));
    const ePred = round(prof.expense + 0.045 * mid + normal() * 4_000, 500);

    // --- reality: how outcomes relate to beliefs (the firm's actual calibration)
    let q = p <= 0.7 ? p : 0.7 - (p - 0.7) * 0.15;
    if (attorney.key === "rodriguez") q = p;
    if (attorney.key === "keller" && p > 0.6) q -= 0.08;
    q = clamp(q, 0.05, 0.95);
    const favorable = rnd() < q;
    const bandRatio = mid >= 1_000_000 ? 0.55 : mid >= 500_000 ? 0.88 : 1.0;
    const gross = favorable ? round(Math.max(15_000, mid * Math.exp(Math.log(bandRatio) + 0.3 * normal())), 500) : 0;
    let durBias = prof.durationBias + (isPacific ? 6 : 0) + (attorney.key === "rodriguez" ? 4.2 : 0);
    if (!favorable) durBias -= 1.5;
    const dActual = Math.max(3, dPred + durBias + normal() * 3.2);
    let expRatio = prof.expenseBias * (isPacific ? 1.55 : 1) * (attorney.key === "rodriguez" ? 1.36 : 1);
    if (!favorable) expRatio *= 0.85;
    const eActual = round(Math.max(3_000, ePred * Math.exp(Math.log(expRatio) + 0.22 * normal())), 100);
    const resolvedOn = addMonths(opened, dActual);
    const closed = resolvedOn <= opts.asOf;
    const elapsed = closed ? dActual : Math.max(0.5, (asOf.getTime() - Date.parse(`${opened}T00:00:00Z`)) / 86400_000 / 30.4375);
    const progress = Math.min(1, elapsed / dActual);
    const hours = Math.round(dActual * u(16, 28) * (mid > 600_000 ? 1.4 : 1));

    // --- identity
    let name = "";
    do { name = `${pick(PLAINTIFFS)} v. ${pick(DEFENDANTS)}`; } while (usedNames.has(name));
    usedNames.add(name);
    const [jurisdiction, court] = pick(COURTS);

    // --- procedural events up to today
    const events: DemoEvent[] = [{ type: "matter_opened", on: opened, title: "Matter opened" }];
    const at = (frac: number) => addMonths(opened, dActual * frac);
    const preLit = favorable && rnd() < 0.18;
    if (!preLit) events.push({ type: "complaint_filed", on: at(0.12), title: `Complaint filed, ${court}` });
    const discoveryClose = at(0.55);
    if (!preLit) {
      events.push({ type: "discovery_started", on: at(0.2), title: "Written discovery served" });
      events.push({ type: "deposition", on: at(0.42), title: "Plaintiff deposition" });
      if (rnd() < 0.6) events.push({ type: "deposition", on: at(0.48), title: "Deposition of HR director" });
      events.push({ type: "discovery_closed", on: discoveryClose, title: "Fact discovery closed" });
      if (rnd() < 0.45) events.push({ type: "expert_retained", on: at(0.58), title: "Economic damages expert retained" });
      if (rnd() < 0.55) {
        events.push({ type: "motion_filed", on: at(0.62), title: "Defendant moved for summary judgment" });
        events.push({ type: "motion_decided", on: at(0.74), title: favorable ? "Summary judgment denied" : "Summary judgment granted in part" });
      }
    }
    if (rnd() < 0.78) {
      events.push({ type: "mediation_scheduled", on: at(0.68), title: "Mediation scheduled" });
      events.push({ type: "mediation_held", on: at(0.82), title: favorable && rnd() < 0.6 ? "Mediation held; parties continued negotiating" : "Mediation held; no resolution" });
    }
    if (!preLit && dActual > 18 && rnd() < 0.35) events.push({ type: "trial_set", on: at(0.88), title: "Trial date set" });

    // --- offers
    const offers: DemoOffer[] = [];
    if (favorable && !preLit) {
      offers.push({ direction: "plaintiff_demand", amount: round(Math.max(gross, high) * u(1.4, 1.9), 5_000), on: at(0.35) });
      offers.push({ direction: "defense_offer", amount: round(gross * u(0.35, 0.55), 5_000), on: at(0.7) });
      offers.push({ direction: "defense_offer", amount: round(gross * u(0.75, 0.9), 5_000), on: at(0.9) });
    } else if (!favorable && rnd() < 0.4) {
      offers.push({ direction: "defense_offer", amount: round(mid * u(0.04, 0.1), 1_000), on: at(0.6) });
    }

    // --- predictions
    const stageAt = (frac: number) => (frac < 0.12 ? "Intake" : frac < 0.2 ? "Pleadings" : frac < 0.55 ? "Discovery" : frac < 0.8 ? "Post-discovery" : "Mediation");
    const driversFor = (prob: number): string[] => {
      const pos = ["strong_documentary_evidence", "clear_liability", "strong_witness_evidence", "significant_damages", "deep_pocket_defendant", "strong_comparator_evidence", "favorable_venue"];
      const neg = ["disputed_liability", "credibility_concern", "damages_uncertainty", "causation_risk", "procedural_risk", "mitigation_concern", "collectability_concern"];
      const nPos = prob > 0.75 ? 3 : prob > 0.55 ? 2 : 1;
      const set = new Set<string>();
      while (set.size < nPos) set.add(pick(pos));
      if (set.size < 3 && prob < 0.8) set.add(pick(neg));
      return [...set].slice(0, 3);
    };
    const predictions: DemoPrediction[] = [];
    const intakeOn = addMonths(opened, u(0, 0.5));
    if (prospective) {
      const recorded = rnd() < (closed ? 0.97 : 0.84);
      if (recorded && intakeOn <= opts.asOf) {
        predictions.push({ version: 1, recordedOn: intakeOn, low, high, probability: Math.round(p * 100) / 100, durationMonths: dPred, expense: ePred, confidence: p > 0.78 ? "high" : p > 0.5 ? "medium" : "low", drivers: driversFor(p), reason: null, source: "prospective", stage: "Intake" });
        const reviseOn = addMonths(discoveryClose, u(0.1, 0.4));
        if (!preLit && rnd() < 0.5 && reviseOn <= opts.asOf && (!closed || reviseOn < resolvedOn)) {
          const p2 = clamp(p + (favorable ? u(0.03, 0.13) : -u(0.06, 0.18)), 0.08, 0.96);
          const target = favorable ? gross : mid * 0.5;
          const mid2 = round(mid + (target - mid) * u(0.35, 0.6), 5_000);
          const reason = pick(["Discovery completed", "Key deposition testimony", "Defendant produced personnel file", "Summary judgment briefing revealed comparator evidence", "Damages expert report received"]);
          predictions.push({ version: 2, recordedOn: reviseOn, low: round(mid2 * 0.8, 5_000), high: round(mid2 * 1.2, 5_000), probability: Math.round(p2 * 100) / 100, durationMonths: Math.round(dPred + (dActual - dPred) * u(0.4, 0.7)), expense: round(ePred + (eActual - ePred) * u(0.4, 0.7), 500), confidence: p2 > 0.75 ? "high" : "medium", drivers: driversFor(p2), reason, source: "prospective", stage: "Post-discovery" });
        }
      }
      // Open matters: most attorneys revisit their estimate after the latest major event.
      const lastMajor = [...events].filter((e) => MAJOR.has(e.type) && e.on <= opts.asOf).sort((a, b) => a.on.localeCompare(b.on)).pop();
      const prev = predictions[predictions.length - 1];
      const reviewOn = lastMajor ? addMonths(lastMajor.on, u(0.15, 1.8)) : null;
      if (!closed && prev && reviewOn && reviewOn > prev.recordedOn && reviewOn <= opts.asOf && rnd() < 0.74) {
        const pr = clamp(prev.probability + (favorable ? u(-0.02, 0.08) : -u(0.02, 0.12)), 0.08, 0.96);
        const midR = round((prev.low + prev.high) / 2 * (favorable ? u(0.95, 1.12) : u(0.75, 0.95)), 5_000);
        predictions.push({ version: prev.version + 1, recordedOn: reviewOn, low: round(midR * 0.8, 5_000), high: round(midR * 1.2, 5_000), probability: Math.round(pr * 100) / 100, durationMonths: Math.round((prev.durationMonths ?? dPred) + Math.max(0, dActual - (prev.durationMonths ?? dPred)) * u(0.3, 0.6)), expense: round((prev.expense ?? ePred) + Math.max(0, eActual - (prev.expense ?? ePred)) * u(0.3, 0.6), 500), confidence: pr > 0.75 ? "high" : "medium", drivers: driversFor(pr), reason: pick(["Reviewed after mediation", "Updated after deposition testimony", "Reviewed after motion ruling", "Quarterly portfolio review", "Updated after expert retention"]), source: "prospective", stage: stageAt(progress) });
      }
    } else if (rnd() < 0.36) {
      predictions.push({ version: 1, recordedOn: intakeOn, low, high, probability: Math.round(p * 20) / 20, durationMonths: rnd() < 0.6 ? dPred : null, expense: rnd() < 0.5 ? ePred : null, confidence: null, drivers: [], reason: null, source: "historical", stage: "Intake" });
    }

    // --- outcome and financials
    let outcome: DemoOutcome | null = null;
    if (closed) {
      const resolutionType = favorable
        ? weighted([["settlement", 90], ["judgment_plaintiff", 5], ["arbitration_award", 5]])
        : weighted([["dismissal", 42], ["judgment_defense", 20], ["withdrawn", 28], ["arbitration_defense", 10]]);
      const feeRate = preLit ? 0.333 : 0.4;
      const fee = favorable ? Math.round(gross * feeRate) : 0;
      const referralFee = favorable && source ? Math.round(fee * source.referralFeeShare) : 0;
      outcome = { resolutionType, favorable, resolvedOn, gross, fee, referralFee, expenses: eActual, netToClient: favorable ? Math.max(0, gross - fee - eActual) : 0, hours };
      events.push({ type: "other", on: resolvedOn, title: favorable ? (resolutionType === "settlement" ? "Matter settled" : "Award entered for plaintiff") : "Matter resolved without recovery" });
    }
    const visibleEvents = events.filter((e) => e.on <= opts.asOf).sort((a, b) => a.on.localeCompare(b.on));
    const stage = closed ? "Resolved" : stageAt(progress);
    matters.push({
      externalId: `KR-${String(1000 + i)}`, name, category, originalCategory: pick(prof.raw), attorney: attorney.key, source: source?.key ?? null,
      jurisdiction, court, openedOn: opened, status: closed ? "closed" : "open", stage,
      expensesToDate: closed ? eActual : round(eActual * Math.min(1, progress * u(0.9, 1.15)), 100), hours: closed ? hours : Math.round(hours * progress),
      industry: pick(INDUSTRIES), size: pick(SIZES), predictions, events: visibleEvents, offers: offers.filter((o) => o.on <= opts.asOf && (!closed || o.on <= resolvedOn)), outcome,
      imported: !prospective,
    });
  }

  scriptFlagshipMatters(matters, opts.asOf, addMonths);
  return { matters };
}

/** Two hand-authored matters used in the investor walkthrough. Values are internally consistent. */
function scriptFlagshipMatters(ms: DemoMatter[], asOf: string, addMonths: (d: string, m: number) => string) {
  const opened = "2024-03-14";
  const okonkwo: DemoMatter = {
    externalId: "KR-1182", name: "Okonkwo v. Meridian Logistics", category: "wrongful_termination", originalCategory: "Wrongful Termination",
    attorney: "ross", source: "bar", jurisdiction: "CA", court: "Los Angeles County Superior Court", openedOn: opened, status: "closed", stage: "Resolved",
    expensesToDate: 48_200, hours: 410, industry: "Logistics", size: "1,000–4,999",
    predictions: [
      { version: 1, recordedOn: opened, low: 300_000, high: 450_000, probability: 0.65, durationMonths: 14, expense: 45_000, confidence: "medium", drivers: ["strong_documentary_evidence", "clear_liability", "damages_uncertainty"], reason: null, source: "prospective", stage: "Intake" },
      { version: 2, recordedOn: "2024-10-09", low: 400_000, high: 550_000, probability: 0.78, durationMonths: 17, expense: 50_000, confidence: "high", drivers: ["strong_documentary_evidence", "clear_liability", "strong_witness_evidence"], reason: "Discovery completed: dispatch logs and the termination memo corroborate the client's account.", source: "prospective", stage: "Post-discovery" },
    ],
    events: [
      { type: "matter_opened", on: opened, title: "Matter opened" },
      { type: "complaint_filed", on: "2024-05-02", title: "Complaint filed, Los Angeles County Superior Court" },
      { type: "discovery_started", on: "2024-06-10", title: "Written discovery served" },
      { type: "deposition", on: "2024-09-12", title: "Deposition of regional operations manager" },
      { type: "discovery_closed", on: "2024-10-02", title: "Fact discovery closed" },
      { type: "mediation_scheduled", on: "2025-03-20", title: "Mediation scheduled with Hon. R. Alvarez (Ret.)" },
      { type: "mediation_held", on: "2025-06-24", title: "Mediation held; parties continued negotiating" },
      { type: "other", on: "2025-08-14", title: "Matter settled" },
    ],
    offers: [
      { direction: "plaintiff_demand", amount: 650_000, on: "2024-11-18" },
      { direction: "defense_offer", amount: 220_000, on: "2025-01-15" },
      { direction: "defense_offer", amount: 380_000, on: "2025-06-24" },
      { direction: "defense_offer", amount: 475_000, on: "2025-08-07" },
    ],
    outcome: { resolutionType: "settlement", favorable: true, resolvedOn: "2025-08-14", gross: 475_000, fee: 190_000, referralFee: 19_000, expenses: 48_200, netToClient: 236_800, hours: 410 },
    imported: false,
  };
  const latest = addMonths(asOf, -7);
  const deOpened = addMonths(asOf, -19);
  const delgado: DemoMatter = {
    externalId: "KR-1843", name: "Delgado v. Corepoint Manufacturing", category: "discrimination", originalCategory: "Race disc",
    attorney: "rodriguez", source: "pacific", jurisdiction: "CA", court: "C.D. Cal.", openedOn: deOpened, status: "open", stage: "Post-discovery",
    expensesToDate: 81_200, hours: 520, industry: "Manufacturing", size: "5,000+",
    predictions: [
      { version: 1, recordedOn: addMonths(deOpened, 0.2), low: 450_000, high: 650_000, probability: 0.7, durationMonths: 18, expense: 48_000, confidence: "medium", drivers: ["strong_comparator_evidence", "significant_damages", "disputed_liability"], reason: null, source: "prospective", stage: "Intake" },
      { version: 2, recordedOn: latest, low: 500_000, high: 700_000, probability: 0.74, durationMonths: 22, expense: 55_000, confidence: "medium", drivers: ["strong_comparator_evidence", "significant_damages", "deep_pocket_defendant"], reason: "Comparator data produced in discovery.", source: "prospective", stage: "Discovery" },
    ],
    events: [
      { type: "matter_opened", on: deOpened, title: "Matter opened" },
      { type: "complaint_filed", on: addMonths(deOpened, 2), title: "Complaint filed, C.D. Cal." },
      { type: "discovery_started", on: addMonths(deOpened, 3), title: "Written discovery served" },
      { type: "expert_retained", on: addMonths(deOpened, 9), title: "Statistical expert retained" },
      { type: "discovery_closed", on: addMonths(deOpened, 14), title: "Fact discovery closed" },
      { type: "motion_filed", on: addMonths(deOpened, 15), title: "Defendant moved for summary judgment" },
      { type: "motion_decided", on: addMonths(deOpened, 17.5), title: "Summary judgment denied" },
    ],
    offers: [{ direction: "defense_offer", amount: 175_000, on: addMonths(deOpened, 17.8) }],
    outcome: null,
    imported: false,
  };
  const i1 = ms.findIndex((m) => m.externalId === "KR-1182");
  const i2 = ms.findIndex((m) => m.externalId === "KR-1843");
  if (i1 >= 0) ms[i1] = okonkwo; else ms.push(okonkwo);
  if (i2 >= 0) ms[i2] = delgado; else ms.push(delgado);
}
