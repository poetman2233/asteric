/**
 * Organization-level configuration stored in organizations.settings (jsonb).
 * Defaults are deliberately conservative and every assumption is shown in-app
 * beside the metric it affects.
 */
export type OrgSettings = {
  /** Internal fully loaded cost of one attorney hour, used for fully costed ROLC. Null = not configured. */
  attorneyHourlyCost: number | null;
  /** When a fee is missing but gross recovery is known, derive the fee at this rate (0–1). Null = do not derive. */
  defaultContingencyRate: number | null;
  /** Assume advanced litigation expenses are reimbursed from a favorable recovery. */
  expensesReimbursedFromRecovery: boolean;
  /** A prediction older than this is flagged in Portfolio Watch. */
  staleDays: number;
  /** Expense overrun (fraction above latest prediction) that triggers a Portfolio Watch flag. */
  expenseVarianceThreshold: number;
  /** Whether analysts may see which attorney recorded a prediction. */
  analystsSeePredictionAuthors: boolean;
  /** Allow sending column headers to the configured AI provider for mapping suggestions. Off by default. */
  aiAssistEnabled: boolean;
  /** Network participation. Always "not_enrolled" in V1: contribution is not yet offered. */
  networkParticipation: "not_enrolled";
};

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  attorneyHourlyCost: null,
  defaultContingencyRate: null,
  expensesReimbursedFromRecovery: true,
  staleDays: 180,
  expenseVarianceThreshold: 0.25,
  analystsSeePredictionAuthors: true,
  aiAssistEnabled: false,
  networkParticipation: "not_enrolled",
};

export function readOrgSettings(raw: unknown): OrgSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as Partial<OrgSettings>;
  return { ...DEFAULT_ORG_SETTINGS, ...s, networkParticipation: "not_enrolled" };
}
