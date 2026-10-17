/**
 * Asteric canonical import fields. Source columns are mapped onto these.
 * `kind` drives value parsing and type-sniffing during mapping.
 */
export type FieldKind = "text" | "money" | "date" | "number" | "percent" | "category" | "status" | "resolution" | "person" | "source";

export type CanonicalField = { key: string; label: string; kind: FieldKind; group: "Matter" | "Outcome" | "Historical prediction"; synonyms: string[] };

export const CANONICAL_FIELDS: CanonicalField[] = [
  { key: "external_id", label: "Matter ID", kind: "text", group: "Matter", synonyms: ["matter id", "matter number", "matter no", "case id", "case number", "case no", "file number", "file no", "matter", "id", "matter ref", "reference"] },
  { key: "name", label: "Matter name", kind: "text", group: "Matter", synonyms: ["matter name", "case name", "caption", "title", "case", "case title", "matter description"] },
  { key: "status", label: "Matter status", kind: "status", group: "Matter", synonyms: ["status", "matter status", "case status", "open closed", "state of matter"] },
  { key: "category", label: "Matter category", kind: "category", group: "Matter", synonyms: ["category", "practice type", "case type", "matter type", "claim type", "practice area", "claim", "type", "cause of action"] },
  { key: "jurisdiction", label: "Jurisdiction", kind: "text", group: "Matter", synonyms: ["jurisdiction", "state", "venue", "county"] },
  { key: "court", label: "Court", kind: "text", group: "Matter", synonyms: ["court", "forum", "tribunal"] },
  { key: "lead_attorney", label: "Lead attorney", kind: "person", group: "Matter", synonyms: ["lead attorney", "attorney", "atty", "responsible attorney", "handling attorney", "partner", "lawyer", "lead counsel", "assigned attorney"] },
  { key: "referral_source", label: "Referral source", kind: "source", group: "Matter", synonyms: ["referral source", "referral", "referred by", "source", "lead source", "intake source", "referring attorney", "marketing source"] },
  { key: "client_ref", label: "Client reference", kind: "text", group: "Matter", synonyms: ["client", "client id", "client number", "client ref"] },
  { key: "opened_on", label: "Date opened", kind: "date", group: "Matter", synonyms: ["date opened", "open date", "opened", "intake date", "date of intake", "sign up date", "signup date", "retained date", "created date", "date retained"] },
  { key: "closed_on", label: "Date closed", kind: "date", group: "Matter", synonyms: ["date closed", "close date", "closed", "closed date", "date resolved"] },
  { key: "procedural_stage", label: "Procedural stage", kind: "text", group: "Matter", synonyms: ["stage", "procedural stage", "phase", "litigation stage", "case stage"] },
  { key: "defendant_industry", label: "Defendant industry", kind: "text", group: "Matter", synonyms: ["industry", "defendant industry", "employer industry"] },
  { key: "defendant_size", label: "Defendant size", kind: "text", group: "Matter", synonyms: ["employer size", "defendant size", "company size", "employees", "headcount"] },
  { key: "expenses_to_date", label: "Expenses to date", kind: "money", group: "Matter", synonyms: ["expenses to date", "costs to date", "costs advanced to date", "current costs"] },
  { key: "resolution_type", label: "Resolution type", kind: "resolution", group: "Outcome", synonyms: ["resolution", "resolution type", "disposition", "outcome", "result", "how resolved", "disposition type"] },
  { key: "resolved_on", label: "Resolution date", kind: "date", group: "Outcome", synonyms: ["resolution date", "resolved date", "settlement date", "disposition date", "date of resolution", "verdict date"] },
  { key: "gross_recovery", label: "Gross recovery", kind: "money", group: "Outcome", synonyms: ["gross recovery", "settlement amount", "settlement", "recovery", "gross settlement", "verdict amount", "award", "total recovery", "gross"] },
  { key: "attorney_fee", label: "Attorney fee", kind: "money", group: "Outcome", synonyms: ["attorney fee", "attorneys fees", "attorney fees", "fee", "fees", "contingency fee", "firm fee", "legal fee", "fee earned"] },
  { key: "referral_fee_paid", label: "Referral fee paid", kind: "money", group: "Outcome", synonyms: ["referral fee", "referral fee paid", "co counsel fee", "fee split"] },
  { key: "net_to_client", label: "Net to client", kind: "money", group: "Outcome", synonyms: ["net to client", "client net", "net client", "client recovery", "client share"] },
  { key: "litigation_expenses", label: "Litigation expenses", kind: "money", group: "Outcome", synonyms: ["expenses", "costs", "case costs", "litigation expenses", "litigation costs", "hard costs", "costs advanced", "total costs", "total expenses"] },
  { key: "attorney_hours", label: "Attorney hours", kind: "number", group: "Outcome", synonyms: ["hours", "attorney hours", "billable hours", "hours worked", "time spent", "total hours"] },
  { key: "pred_probability", label: "Predicted probability (historical)", kind: "percent", group: "Historical prediction", synonyms: ["intake probability", "estimated probability", "win probability", "probability", "likelihood", "chance of success", "success probability"] },
  { key: "pred_low", label: "Predicted recovery low (historical)", kind: "money", group: "Historical prediction", synonyms: ["case value low", "value low", "estimate low", "low estimate", "estimated value low", "low value"] },
  { key: "pred_high", label: "Predicted recovery high (historical)", kind: "money", group: "Historical prediction", synonyms: ["case value high", "value high", "estimate high", "high estimate", "estimated value high", "high value"] },
  { key: "pred_duration", label: "Predicted duration months (historical)", kind: "number", group: "Historical prediction", synonyms: ["estimated duration", "expected duration", "duration estimate", "est months", "estimated months"] },
  { key: "pred_expense", label: "Predicted expense (historical)", kind: "money", group: "Historical prediction", synonyms: ["budget", "estimated costs", "cost estimate", "expense estimate", "estimated expenses", "budgeted costs"] },
  { key: "pred_date", label: "Prediction date (historical)", kind: "date", group: "Historical prediction", synonyms: ["evaluation date", "estimate date", "assessment date", "case evaluation date"] },
  { key: "notes", label: "Notes", kind: "text", group: "Matter", synonyms: ["notes", "comments", "memo", "remarks"] },
];

export const FIELD_BY_KEY = Object.fromEntries(CANONICAL_FIELDS.map((f) => [f.key, f]));
/** Fields every import must map. Everything else is optional. */
export const REQUIRED_ONE_OF = ["name", "external_id"] as const;

/** Header signatures of common case-management exports (exports only; no live integration). */
export const SOURCE_SIGNATURES: { system: string; tokens: string[] }[] = [
  { system: "Filevine", tokens: ["project id", "project name", "phase"] },
  { system: "Litify", tokens: ["litify", "matter name", "intake"] },
  { system: "Clio", tokens: ["matter number", "responsible attorney", "practice area"] },
  { system: "Salesforce", tokens: ["record id", "account name", "opportunity"] },
  { system: "SmartAdvocate", tokens: ["case #", "case type", "sa "] },
];
