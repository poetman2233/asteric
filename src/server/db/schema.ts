/**
 * Asteric relational schema.
 *
 * Tenancy: every table holding customer information carries `organization_id`.
 * Isolation is enforced twice:
 *   1. Application layer — every query runs through `withTenant(orgId, ...)`.
 *   2. Database layer   — Postgres Row-Level Security policies (see drizzle/0001_security.sql)
 *      applied to the non-bypass role `asteric_app`, which tenant transactions assume.
 *
 * Immutability: `predictions` and `audit_events` are append-only. The app role has no
 * UPDATE/DELETE grant on them, and triggers reject modification as a second layer.
 * A revision is a new prediction row with an incremented `version`.
 */
import { sql } from "drizzle-orm";
import {
  boolean, date, index, integer, jsonb, numeric, pgEnum, pgSchema, pgTable, primaryKey,
  real, text, timestamp, uniqueIndex, uuid, customType,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const orgId = () => uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ---------------------------------------------------------------- enums */
export const roleEnum = pgEnum("member_role", ["owner", "admin", "attorney", "analyst", "viewer", "demo"]);
export const matterStatusEnum = pgEnum("matter_status", ["open", "closed"]);
export const confidenceEnum = pgEnum("confidence_level", ["low", "medium", "high"]);
export const predictionSourceEnum = pgEnum("prediction_source", ["prospective", "historical", "sandbox"]);
export const eventTypeEnum = pgEnum("event_type", [
  "matter_opened", "complaint_filed", "discovery_started", "discovery_closed", "deposition",
  "motion_filed", "motion_decided", "mediation_scheduled", "mediation_held", "expert_retained",
  "expert_expense", "trial_set", "settlement_conference", "other",
]);
export const offerDirectionEnum = pgEnum("offer_direction", ["defense_offer", "plaintiff_demand"]);
export const resolutionEnum = pgEnum("resolution_type", [
  "settlement", "judgment_plaintiff", "judgment_defense", "arbitration_award", "arbitration_defense",
  "dismissal", "withdrawn", "other",
]);
export const importStatusEnum = pgEnum("import_status", ["uploaded", "mapped", "reviewing", "committing", "completed", "failed", "cancelled"]);
export const provenanceSourceEnum = pgEnum("provenance_source", [
  "import", "attorney_entered", "manually_corrected", "derived", "extracted", "demo_seed",
]);
export const reviewDecisionEnum = pgEnum("review_decision", ["pending", "accepted", "corrected"]);

/* ---------------------------------------------------------------- identity */
export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  isDemo: boolean("is_demo").notNull().default(false),
  practiceArea: text("practice_area"),
  attorneyCount: text("attorney_count"),
  matterVolume: text("matter_volume"),
  caseManagementSystem: text("case_management_system"),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  currency: text("currency").notNull().default("USD"),
  /** Typed in src/server/org-settings.ts */
  settings: jsonb("settings").notNull().default({}),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }),
  deletionRequestedBy: uuid("deletion_requested_by"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  title: text("title"),
  passwordHash: text("password_hash"),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecretEnc: text("mfa_secret_enc"),
  mfaRecoveryHashes: text("mfa_recovery_hashes").array(),
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  isDemoUser: boolean("is_demo_user").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("users_email_uq").on(t.email)]);

export const memberships = pgTable("memberships", {
  id: id(),
  organizationId: orgId(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: roleEnum("role").notNull(),
  attorneyId: uuid("attorney_id"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("memberships_org_user_uq").on(t.organizationId, t.userId), index("memberships_user_idx").on(t.userId)]);

export const sessions = pgTable("sessions", {
  id: id(),
  tokenHash: text("token_hash").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  activeOrganizationId: uuid("active_organization_id"),
  mfaPending: boolean("mfa_pending").notNull().default(false),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)]);

/** Single-use tokens: email verification, password reset. Only hashes are stored. */
export const authTokens = pgTable("auth_tokens", {
  id: id(),
  kind: text("kind").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("auth_tokens_hash_uq").on(t.tokenHash)]);

export const invitations = pgTable("invitations", {
  id: id(),
  organizationId: orgId(),
  email: text("email").notNull(),
  role: roleEnum("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  invitedBy: uuid("invited_by"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("invitations_hash_uq").on(t.tokenHash), index("invitations_org_idx").on(t.organizationId)]);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
});

/** Public "Request access" submissions. Platform-level, not tenant data. */
export const accessRequests = pgTable("access_requests", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  firm: text("firm").notNull(),
  role: text("role"),
  firmSize: text("firm_size"),
  message: text("message"),
  kind: text("kind").notNull().default("access"),
  status: text("status").notNull().default("new"),
  organizationId: uuid("organization_id"),
  createdAt: createdAt(),
});

/* ---------------------------------------------------------------- reference data */
export const attorneys = pgTable("attorneys", {
  id: id(),
  organizationId: orgId(),
  name: text("name").notNull(),
  title: text("title"),
  userId: uuid("user_id"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("attorneys_org_name_uq").on(t.organizationId, t.name)]);

export const referralSources = pgTable("referral_sources", {
  id: id(),
  organizationId: orgId(),
  name: text("name").notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("referral_org_name_uq").on(t.organizationId, t.name)]);

/** Configurable canonical matter categories per organization. */
export const categories = pgTable("categories", {
  id: id(),
  organizationId: orgId(),
  key: text("key").notNull(),
  label: text("label").notNull(),
  practiceArea: text("practice_area").notNull().default("employment"),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
}, (t) => [uniqueIndex("categories_org_key_uq").on(t.organizationId, t.key)]);

/* ---------------------------------------------------------------- matters */
export const matters = pgTable("matters", {
  id: id(),
  organizationId: orgId(),
  externalId: text("external_id"),
  name: text("name").notNull(),
  status: matterStatusEnum("status").notNull().default("open"),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  originalCategory: text("original_category"),
  jurisdiction: text("jurisdiction"),
  court: text("court"),
  leadAttorneyId: uuid("lead_attorney_id").references(() => attorneys.id, { onDelete: "set null" }),
  referralSourceId: uuid("referral_source_id").references(() => referralSources.id, { onDelete: "set null" }),
  clientRef: text("client_ref"),
  openedOn: date("opened_on", { mode: "string" }),
  closedOn: date("closed_on", { mode: "string" }),
  proceduralStage: text("procedural_stage"),
  defendantIndustry: text("defendant_industry"),
  defendantSize: text("defendant_size"),
  attorneyHours: numeric("attorney_hours", { precision: 10, scale: 1, mode: "number" }),
  expensesToDate: money("expenses_to_date"),
  notes: text("notes"),
  importId: uuid("import_id"),
  possibleDuplicateOf: uuid("possible_duplicate_of"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("matters_org_status_idx").on(t.organizationId, t.status),
  index("matters_org_category_idx").on(t.organizationId, t.categoryId),
  index("matters_org_attorney_idx").on(t.organizationId, t.leadAttorneyId),
  index("matters_org_referral_idx").on(t.organizationId, t.referralSourceId),
  index("matters_org_opened_idx").on(t.organizationId, t.openedOn),
  uniqueIndex("matters_org_external_uq").on(t.organizationId, t.externalId).where(sql`external_id is not null`),
]);

/** Append-only. Never updated, never deleted (except organization purge / demo sandbox reset). */
export const predictions = pgTable("predictions", {
  id: id(),
  organizationId: orgId(),
  matterId: uuid("matter_id").notNull().references(() => matters.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  authorUserId: uuid("author_user_id"),
  authorAttorneyId: uuid("author_attorney_id"),
  authorLabel: text("author_label").notNull(),
  recoveryLow: money("recovery_low").notNull(),
  recoveryHigh: money("recovery_high").notNull(),
  probability: numeric("probability", { precision: 5, scale: 4, mode: "number" }).notNull(),
  expectedDurationMonths: numeric("expected_duration_months", { precision: 6, scale: 1, mode: "number" }),
  expectedExpense: money("expected_expense"),
  /** Null only for historical predictions imported without a recorded confidence. */
  confidence: confidenceEnum("confidence"),
  drivers: text("drivers").array().notNull().default(sql`'{}'::text[]`),
  proceduralStage: text("procedural_stage"),
  revisionReason: text("revision_reason"),
  source: predictionSourceEnum("source").notNull().default("prospective"),
  supersedesId: uuid("supersedes_id"),
  /** The attorney's answers in the quick-assessment flow, kept beside the structured result. */
  assessmentInputs: jsonb("assessment_inputs"),
  /** A timestamped "no change" confirmation: same values as the previous version. */
  isReaffirmation: boolean("is_reaffirmation").notNull().default(false),
  momentId: uuid("moment_id"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("predictions_matter_version_uq").on(t.matterId, t.version),
  index("predictions_org_matter_idx").on(t.organizationId, t.matterId, t.recordedAt),
]);

export const proceduralEvents = pgTable("procedural_events", {
  id: id(),
  organizationId: orgId(),
  matterId: uuid("matter_id").notNull().references(() => matters.id, { onDelete: "cascade" }),
  type: eventTypeEnum("type").notNull(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  amount: money("amount"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
}, (t) => [index("events_org_matter_idx").on(t.organizationId, t.matterId, t.occurredOn)]);

export const offers = pgTable("offers", {
  id: id(),
  organizationId: orgId(),
  matterId: uuid("matter_id").notNull().references(() => matters.id, { onDelete: "cascade" }),
  direction: offerDirectionEnum("direction").notNull(),
  amount: money("amount").notNull(),
  offeredOn: date("offered_on", { mode: "string" }).notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
}, (t) => [index("offers_org_matter_idx").on(t.organizationId, t.matterId, t.offeredOn)]);

/**
 * Final financial outcome. Financial semantics are explicit:
 *  gross_recovery     — total paid by the defendant
 *  attorney_fee       — the firm's contingency fee (before any referral fee split)
 *  referral_fee_paid  — portion of the fee paid to a referring attorney
 *  litigation_expenses — case costs advanced by the firm
 *  net_to_client      — amount paid to the client
 */
export const outcomes = pgTable("outcomes", {
  id: id(),
  organizationId: orgId(),
  matterId: uuid("matter_id").notNull().references(() => matters.id, { onDelete: "cascade" }),
  resolutionType: resolutionEnum("resolution_type").notNull(),
  favorable: boolean("favorable").notNull(),
  resolvedOn: date("resolved_on", { mode: "string" }).notNull(),
  grossRecovery: money("gross_recovery"),
  attorneyFee: money("attorney_fee"),
  referralFeePaid: money("referral_fee_paid"),
  litigationExpenses: money("litigation_expenses"),
  netToClient: money("net_to_client"),
  attorneyHours: numeric("attorney_hours", { precision: 10, scale: 1, mode: "number" }),
  notes: text("notes"),
  recordedBy: uuid("recorded_by"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("outcomes_matter_uq").on(t.matterId), index("outcomes_org_idx").on(t.organizationId)]);

/* ---------------------------------------------------------------- imports */
export const imports = pgTable("imports", {
  id: id(),
  organizationId: orgId(),
  filename: text("filename").notNull(),
  fileSize: integer("file_size").notNull(),
  mime: text("mime").notNull(),
  sha256: text("sha256").notNull(),
  status: importStatusEnum("status").notNull().default("uploaded"),
  sourceSystem: text("source_system"),
  rowCount: integer("row_count").notNull().default(0),
  columnHeaders: jsonb("column_headers").notNull().default([]),
  mapping: jsonb("mapping").notNull().default({}),
  report: jsonb("report"),
  error: text("error"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
}, (t) => [index("imports_org_idx").on(t.organizationId, t.createdAt)]);

/** Raw uploaded file bytes. Private: never served by URL; readable only within the tenant. */
export const importFiles = pgTable("import_files", {
  importId: uuid("import_id").primaryKey().references(() => imports.id, { onDelete: "cascade" }),
  organizationId: orgId(),
  data: bytea("data").notNull(),
});

export const importRows = pgTable("import_rows", {
  id: id(),
  organizationId: orgId(),
  importId: uuid("import_id").notNull().references(() => imports.id, { onDelete: "cascade" }),
  rowNumber: integer("row_number").notNull(),
  raw: jsonb("raw").notNull(),
  status: text("status").notNull().default("pending"),
  issues: jsonb("issues").notNull().default([]),
  matterId: uuid("matter_id"),
}, (t) => [index("import_rows_import_idx").on(t.importId, t.rowNumber)]);

/** Distinct source values awaiting or having received human review during normalization. */
export const importValueReviews = pgTable("import_value_reviews", {
  id: id(),
  organizationId: orgId(),
  importId: uuid("import_id").notNull().references(() => imports.id, { onDelete: "cascade" }),
  field: text("field").notNull(),
  originalValue: text("original_value").notNull(),
  suggestedValue: text("suggested_value"),
  confidence: real("confidence").notNull(),
  method: text("method").notNull(),
  decision: reviewDecisionEnum("decision").notNull().default("pending"),
  finalValue: text("final_value"),
  occurrences: integer("occurrences").notNull().default(1),
  reviewedBy: uuid("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, (t) => [uniqueIndex("ivr_import_field_value_uq").on(t.importId, t.field, t.originalValue)]);

/** Field-level lineage for imported, normalized, derived and corrected values. */
export const provenance = pgTable("provenance", {
  id: id(),
  organizationId: orgId(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  field: text("field").notNull(),
  originalValue: text("original_value"),
  normalizedValue: text("normalized_value"),
  source: provenanceSourceEnum("source").notNull(),
  importId: uuid("import_id"),
  confidence: real("confidence"),
  method: text("method"),
  reviewedBy: uuid("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("provenance_entity_idx").on(t.organizationId, t.entityId)]);

/* ---------------------------------------------------------------- governance */
/** Append-only, server-generated. Platform events have a null organization. */
export const auditEvents = pgTable("audit_events", {
  id: id(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id"),
  actorLabel: text("actor_label").notNull(),
  action: text("action").notNull(),
  objectType: text("object_type"),
  objectId: uuid("object_id"),
  summary: text("summary").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt(),
}, (t) => [index("audit_org_time_idx").on(t.organizationId, t.createdAt)]);

export const notificationReads = pgTable("notification_reads", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: orgId(),
  lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.organizationId] })]);

export const savedViews = pgTable("saved_views", {
  id: id(),
  organizationId: orgId(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  path: text("path").notNull(),
  query: text("query").notNull(),
  createdAt: createdAt(),
}, (t) => [index("saved_views_user_idx").on(t.organizationId, t.userId)]);

/* ---------------------------------------------------------------- V2: decision workflow */
/** A point at which the firm's judgment should be reconfirmed (event, offer, expense, manual, integration). */
export const decisionMoments = pgTable("decision_moments", {
  id: id(),
  organizationId: orgId(),
  matterId: uuid("matter_id").notNull().references(() => matters.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  source: text("source").notNull().default("event"),
  eventId: uuid("event_id"),
  offerId: uuid("offer_id"),
  note: text("note"),
  status: text("status").notNull().default("open"),
  resolution: text("resolution"),
  predictionId: uuid("prediction_id"),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by"),
}, (t) => [index("moments_org_status_idx").on(t.organizationId, t.status), index("moments_matter_idx").on(t.organizationId, t.matterId)]);

/** Append-only log of what people did with Decision Inbox items. The latest action per item key applies. */
export const inboxActions = pgTable("inbox_actions", {
  id: id(),
  organizationId: orgId(),
  itemKey: text("item_key").notNull(),
  matterId: uuid("matter_id").references(() => matters.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  assignedTo: uuid("assigned_to"),
  snoozeUntil: timestamp("snooze_until", { withTimezone: true }),
  reason: text("reason"),
  createdBy: uuid("created_by"),
  createdByLabel: text("created_by_label"),
  createdAt: createdAt(),
}, (t) => [index("inbox_actions_key_idx").on(t.organizationId, t.itemKey, t.createdAt)]);

/** Review criteria created by the firm. Asteric evaluates them; it does not author them. */
export const reviewRules = pgTable("review_rules", {
  id: id(),
  organizationId: orgId(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  params: jsonb("params").notNull().default({}),
  active: boolean("active").notNull().default(true),
  sourceInsight: text("source_insight"),
  createdBy: uuid("created_by"),
  createdByLabel: text("created_by_label").notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("review_rules_org_idx").on(t.organizationId, t.active)]);

/** Consequential firm decisions on a matter. Append-only. */
export const decisions = pgTable("decisions", {
  id: id(),
  organizationId: orgId(),
  matterId: uuid("matter_id").notNull().references(() => matters.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  reason: text("reason"),
  predictionId: uuid("prediction_id"),
  eventId: uuid("event_id"),
  capitalAmount: money("capital_amount"),
  decidedBy: uuid("decided_by"),
  decidedLabel: text("decided_label").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [index("decisions_org_matter_idx").on(t.organizationId, t.matterId, t.decidedAt)]);

/** Lightweight record of matters the firm declined or referred out, so learning is not limited to accepted cases. */
export const intakeDecisions = pgTable("intake_decisions", {
  id: id(),
  organizationId: orgId(),
  receivedOn: date("received_on", { mode: "string" }).notNull(),
  label: text("label"),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  referralSourceId: uuid("referral_source_id").references(() => referralSources.id, { onDelete: "set null" }),
  attorneyId: uuid("attorney_id").references(() => attorneys.id, { onDelete: "set null" }),
  jurisdiction: text("jurisdiction"),
  disposition: text("disposition").notNull(),
  reasonCode: text("reason_code").notNull(),
  note: text("note"),
  likelihood: text("likelihood"),
  recoveryLow: money("recovery_low"),
  recoveryHigh: money("recovery_high"),
  decidedBy: uuid("decided_by"),
  decidedLabel: text("decided_label").notNull(),
  createdAt: createdAt(),
}, (t) => [index("intake_org_idx").on(t.organizationId, t.receivedOn)]);

/** Firm Learning patterns management chose to monitor. */
export const monitoredPatterns = pgTable("monitored_patterns", {
  id: id(),
  organizationId: orgId(),
  insightId: text("insight_id").notNull(),
  label: text("label").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("monitored_org_insight_uq").on(t.organizationId, t.insightId)]);

/* ---------------------------------------------------------------- network (future) */
/**
 * Network-eligible derived data lives in a separate schema and has NO organization
 * identifier. Nothing writes to it in V1: contribution requires an explicit, separately
 * consented governance process (see V2_ROADMAP.md). Raw tenant tables are never read
 * by network code paths.
 */
export const network = pgSchema("network");
export const networkDerivedSignals = network.table("derived_signals", {
  id: id(),
  contributionKey: text("contribution_key").notNull(),
  categoryKey: text("category_key").notNull(),
  metric: text("metric").notNull(),
  value: real("value").notNull(),
  cohortPeriod: text("cohort_period").notNull(),
  createdAt: createdAt(),
});
