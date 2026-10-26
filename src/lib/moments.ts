/**
 * Decision Moments: points at which a firm's judgment on a matter should be reconfirmed.
 * Today they fire from events, offers and expenses recorded in Asteric. Integrations
 * (Filevine, Litify, ...) can later fire the same moment types through the same service.
 */
export const MOMENT_TYPES = [
  { key: "matter_accepted", label: "Matter accepted", prompt: "Record the initial assessment while the outcome is unknown." },
  { key: "offer_received", label: "Settlement offer received", prompt: "Has this offer changed your assessment?" },
  { key: "mediation_scheduled", label: "Mediation scheduled", prompt: "Has your assessment changed ahead of mediation?" },
  { key: "mediation_held", label: "Mediation completed", prompt: "Has mediation changed your assessment?" },
  { key: "discovery_closed", label: "Discovery closed", prompt: "Has discovery changed your assessment?" },
  { key: "deposition", label: "Major deposition completed", prompt: "Has this deposition changed your assessment?" },
  { key: "motion_filed", label: "Dispositive motion filed", prompt: "Has this motion changed your assessment?" },
  { key: "motion_decided", label: "Dispositive motion decided", prompt: "Has this ruling changed your assessment?" },
  { key: "trial_set", label: "Trial date set", prompt: "Has the trial date changed your assessment?" },
  { key: "settlement_conference", label: "Settlement conference", prompt: "Has the settlement conference changed your assessment?" },
  { key: "significant_expense", label: "Significant new expense", prompt: "Does this expense change your expected total?" },
  { key: "material_development", label: "Material development", prompt: "Has this development changed your assessment?" },
] as const;
export type MomentType = (typeof MOMENT_TYPES)[number]["key"];
export const MOMENT_LABEL: Record<string, string> = Object.fromEntries(MOMENT_TYPES.map((m) => [m.key, m.label]));
export const MOMENT_PROMPT: Record<string, string> = Object.fromEntries(MOMENT_TYPES.map((m) => [m.key, m.prompt]));

/** Procedural event types that can be configured as Decision Moments. */
export const EVENT_MOMENTS = ["mediation_scheduled", "mediation_held", "discovery_closed", "deposition", "motion_filed", "motion_decided", "trial_set", "settlement_conference"] as const;

export type MomentSettings = { momentEventTypes: string[]; momentOnOffers: boolean; momentExpenseThreshold: number | null };

export function momentForEvent(eventType: string, amount: number | null | undefined, s: MomentSettings): MomentType | null {
  if (eventType === "expert_expense") return s.momentExpenseThreshold != null && (amount ?? 0) >= s.momentExpenseThreshold ? "significant_expense" : null;
  return s.momentEventTypes.includes(eventType) ? (eventType as MomentType) : null;
}
