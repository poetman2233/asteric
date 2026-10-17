/**
 * Canonical vocabularies. Practice-area specific values are data, not code:
 * categories are copied into each organization's own `categories` table at
 * creation and can be extended there.
 */

export type PracticeArea = "employment" | "personal_injury" | "mass_tort" | "commercial";

export const PRACTICE_AREAS: { key: PracticeArea; label: string }[] = [
  { key: "employment", label: "Plaintiff employment" },
  { key: "personal_injury", label: "Personal injury" },
  { key: "mass_tort", label: "Mass tort" },
  { key: "commercial", label: "Commercial contingency litigation" },
];

/** Default canonical categories, with synonyms used by import normalization. */
export const DEFAULT_CATEGORIES: Record<PracticeArea, { key: string; label: string; synonyms: string[] }[]> = {
  employment: [
    { key: "wrongful_termination", label: "Wrongful termination", synonyms: ["wrongful term", "wrongful discharge", "termination", "wrongful dismissal", "wt", "term"] },
    { key: "retaliation", label: "Retaliation", synonyms: ["feha retaliation", "retal", "retaliatory discharge", "term - retaliation", "1102.5", "labor code retaliation"] },
    { key: "discrimination", label: "Discrimination", synonyms: ["disc", "feha discrimination", "title vii", "age discrimination", "race discrimination", "gender discrimination", "adea", "pregnancy discrimination"] },
    { key: "harassment", label: "Harassment", synonyms: ["sexual harassment", "hostile work environment", "hwe", "harass"] },
    { key: "wage_hour", label: "Wage & hour", synonyms: ["wage and hour", "wage/hour", "w&h", "overtime", "flsa", "unpaid wages", "meal and rest", "misclassification", "paga"] },
    { key: "disability_accommodation", label: "Disability & accommodation", synonyms: ["disability", "ada", "failure to accommodate", "accommodation", "interactive process"] },
    { key: "whistleblower", label: "Whistleblower", synonyms: ["whistle blower", "whistleblowing", "qui tam", "sox", "1102.5 whistleblower"] },
    { key: "leave", label: "Leave (FMLA / CFRA)", synonyms: ["fmla", "cfra", "medical leave", "family leave", "leave interference"] },
    { key: "other", label: "Other employment", synonyms: ["other", "misc", "general employment"] },
  ],
  personal_injury: [
    { key: "motor_vehicle", label: "Motor vehicle", synonyms: ["auto", "car accident", "mva", "truck", "motorcycle"] },
    { key: "premises", label: "Premises liability", synonyms: ["slip and fall", "premises", "trip and fall"] },
    { key: "medical_malpractice", label: "Medical malpractice", synonyms: ["med mal", "medmal", "malpractice"] },
    { key: "product_liability", label: "Product liability", synonyms: ["product", "defective product"] },
    { key: "other", label: "Other injury", synonyms: ["other"] },
  ],
  mass_tort: [
    { key: "pharmaceutical", label: "Pharmaceutical", synonyms: ["drug", "pharma"] },
    { key: "medical_device", label: "Medical device", synonyms: ["device"] },
    { key: "environmental", label: "Environmental", synonyms: ["toxic", "contamination"] },
    { key: "other", label: "Other mass tort", synonyms: ["other"] },
  ],
  commercial: [
    { key: "contract", label: "Breach of contract", synonyms: ["contract", "breach"] },
    { key: "business_tort", label: "Business tort", synonyms: ["fraud", "interference"] },
    { key: "ip", label: "Intellectual property", synonyms: ["patent", "trade secret", "ip"] },
    { key: "other", label: "Other commercial", synonyms: ["other"] },
  ],
};

/** Standardized prediction drivers. Standardized (not free text) so they can be analysed. */
export const DRIVERS: { key: string; label: string }[] = [
  { key: "strong_documentary_evidence", label: "Strong documentary evidence" },
  { key: "strong_witness_evidence", label: "Strong witness evidence" },
  { key: "credibility_concern", label: "Credibility concern" },
  { key: "clear_liability", label: "Clear liability" },
  { key: "disputed_liability", label: "Disputed liability" },
  { key: "significant_damages", label: "Significant damages" },
  { key: "damages_uncertainty", label: "Damages uncertainty" },
  { key: "deep_pocket_defendant", label: "Deep-pocket defendant" },
  { key: "collectability_concern", label: "Collectability concern" },
  { key: "procedural_risk", label: "Procedural risk" },
  { key: "causation_risk", label: "Causation risk" },
  { key: "limitations_risk", label: "Statute-of-limitations risk" },
  { key: "favorable_venue", label: "Favorable venue" },
  { key: "unfavorable_venue", label: "Unfavorable venue" },
  { key: "strong_comparator_evidence", label: "Strong comparator evidence" },
  { key: "mitigation_concern", label: "Mitigation concern" },
];
export const DRIVER_LABEL: Record<string, string> = Object.fromEntries(DRIVERS.map((d) => [d.key, d.label]));

export const PROCEDURAL_STAGES = [
  "Intake", "Pre-litigation", "Pleadings", "Discovery", "Post-discovery", "Mediation", "Trial preparation", "Trial", "Post-trial", "Resolved",
] as const;

export const EVENT_TYPES: { key: string; label: string; major: boolean }[] = [
  { key: "matter_opened", label: "Matter opened", major: false },
  { key: "complaint_filed", label: "Complaint filed", major: true },
  { key: "discovery_started", label: "Discovery started", major: false },
  { key: "discovery_closed", label: "Discovery closed", major: true },
  { key: "deposition", label: "Deposition", major: false },
  { key: "motion_filed", label: "Motion filed", major: false },
  { key: "motion_decided", label: "Motion decided", major: true },
  { key: "mediation_scheduled", label: "Mediation scheduled", major: false },
  { key: "mediation_held", label: "Mediation held", major: true },
  { key: "expert_retained", label: "Expert retained", major: false },
  { key: "expert_expense", label: "Expert expense", major: false },
  { key: "trial_set", label: "Trial date set", major: true },
  { key: "settlement_conference", label: "Settlement conference", major: true },
  { key: "other", label: "Other event", major: false },
];
export const EVENT_LABEL: Record<string, string> = Object.fromEntries(EVENT_TYPES.map((e) => [e.key, e.label]));
export const MAJOR_EVENTS = new Set(EVENT_TYPES.filter((e) => e.major).map((e) => e.key));

export const RESOLUTIONS: { key: string; label: string; favorable: boolean }[] = [
  { key: "settlement", label: "Settlement", favorable: true },
  { key: "judgment_plaintiff", label: "Judgment for plaintiff", favorable: true },
  { key: "arbitration_award", label: "Arbitration award", favorable: true },
  { key: "judgment_defense", label: "Judgment for defense", favorable: false },
  { key: "arbitration_defense", label: "Arbitration (defense)", favorable: false },
  { key: "dismissal", label: "Dismissal", favorable: false },
  { key: "withdrawn", label: "Withdrawn / declined", favorable: false },
  { key: "other", label: "Other", favorable: false },
];
export const RESOLUTION_LABEL: Record<string, string> = Object.fromEntries(RESOLUTIONS.map((r) => [r.key, r.label]));

/**
 * Favorable resolution (the binary event predictions are graded against):
 * a resolution with a positive gross recovery to the client. Settlements of $0,
 * dismissals, defense judgments and withdrawals are unfavorable.
 */
export function isFavorable(resolution: string, grossRecovery: number | null | undefined): boolean {
  const r = RESOLUTIONS.find((x) => x.key === resolution);
  if (!r) return false;
  if (!r.favorable) return false;
  return grossRecovery == null ? true : grossRecovery > 0;
}

export const CASE_MANAGEMENT_SYSTEMS = ["Filevine", "Litify", "Clio", "Salesforce", "SmartAdvocate", "MyCase", "Other", "Spreadsheets only"];
