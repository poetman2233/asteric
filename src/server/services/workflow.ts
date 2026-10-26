import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/server/db";
import {
  attorneys, categories, decisionMoments, decisions, inboxActions, intakeDecisions, matters, memberships, monitoredPatterns,
  predictions, referralSources, reviewRules, users,
} from "@/server/db/schema";
import { AuthError, type OrgContext } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { LedgerError, recordPrediction } from "./ledger";
import { fireMoment, resolveMoment } from "./moments";
import { loadPortfolio, todayIso } from "./portfolio";
import { buildInbox, type LatestAction } from "@/lib/inbox";
import { RULE_TYPES, type Rule, type RuleType } from "@/lib/rules";

const actor = (ctx: OrgContext) => ({ organizationId: ctx.org.id, actorUserId: ctx.user.id, actorLabel: ctx.user.name });
const isUuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

/* ------------------------------------------------------------------ reads */
export async function loadWorkflow(ctx: OrgContext) {
  return withTenant(ctx.org.id, async (tx) => {
    const moments = await tx.select().from(decisionMoments).where(and(eq(decisionMoments.organizationId, ctx.org.id), eq(decisionMoments.status, "open"))).orderBy(desc(decisionMoments.createdAt));
    const rules = await tx.select().from(reviewRules).where(eq(reviewRules.organizationId, ctx.org.id)).orderBy(asc(reviewRules.createdAt));
    const reviews = await tx.select().from(decisions).where(and(eq(decisions.organizationId, ctx.org.id), eq(decisions.type, "second_review")));
    const acts = await tx.select({ a: inboxActions, assignee: users.name }).from(inboxActions).leftJoin(users, eq(users.id, inboxActions.assignedTo))
      .where(eq(inboxActions.organizationId, ctx.org.id)).orderBy(asc(inboxActions.createdAt));
    const monitors = await tx.select().from(monitoredPatterns).where(eq(monitoredPatterns.organizationId, ctx.org.id));
    const members = await tx.select({ id: users.id, name: users.name, role: memberships.role }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, ctx.org.id)).orderBy(asc(users.name));
    const latest = new Map<string, LatestAction>();
    for (const { a, assignee } of acts) latest.set(a.itemKey, { action: a.action, assignedTo: a.assignedTo, assignedLabel: assignee, snoozeUntil: a.snoozeUntil?.toISOString() ?? null, createdAt: a.createdAt.toISOString() });
    return {
      moments: moments.map((m) => ({ id: m.id, matterId: m.matterId, type: m.type, note: m.note, createdAt: m.createdAt.toISOString() })),
      rules: rules.map(toRule),
      reviews: reviews.map((r) => ({ matterId: r.matterId, decidedAt: r.decidedAt.toISOString(), decidedBy: r.decidedBy, decidedLabel: r.decidedLabel })),
      actions: latest, monitors, members: members.filter((m) => m.role !== "demo"),
    };
  });
}

function toRule(r: typeof reviewRules.$inferSelect): Rule {
  return { id: r.id, name: r.name, type: r.type as RuleType, params: (r.params ?? {}) as Rule["params"], active: r.active, createdAt: r.createdAt.toISOString(), createdByLabel: r.createdByLabel, sourceInsight: r.sourceInsight };
}

export async function getInbox(ctx: OrgContext) {
  const [p, w] = [await loadPortfolio(ctx.org.id), await loadWorkflow(ctx)];
  const referralNames = Object.fromEntries(p.referrals.map((r) => [r.id, r.name]));
  const res = buildInbox({ facts: p.facts, moments: w.moments, rules: w.rules, reviews: w.reviews, actions: w.actions, asOf: todayIso(), expenseThreshold: ctx.org.settings.expenseVarianceThreshold, referralNames });
  return { ...res, workflow: w, portfolio: p };
}

/* ------------------------------------------------------------------ assessments */
/** Records a "no change" confirmation: a new immutable version with the same values as the latest assessment. */
export async function reaffirmAssessment(ctx: OrgContext, matterId: string, opts: { momentId?: string | null; itemKey?: string | null; note?: string | null }) {
  if (!isUuid(matterId)) throw new LedgerError("Matter not found.");
  const last = await withTenant(ctx.org.id, async (tx) => (await tx.select().from(predictions).where(and(eq(predictions.matterId, matterId), eq(predictions.organizationId, ctx.org.id))).orderBy(desc(predictions.version)).limit(1))[0]);
  if (!last) throw new LedgerError("There is no assessment to confirm yet. Record an assessment first.");
  const row = await recordPrediction(ctx, matterId, {
    recoveryLow: last.recoveryLow, recoveryHigh: last.recoveryHigh, probability: last.probability,
    expectedDurationMonths: last.expectedDurationMonths ?? 0.5, expectedExpense: last.expectedExpense ?? 0,
    confidence: last.confidence ?? "medium", drivers: last.drivers, revisionReason: opts.note?.trim() || "Reviewed: no change to assessment",
  }, { isReaffirmation: true, momentId: opts.momentId ?? null, inputs: { mode: "reaffirm" } });
  if (opts.itemKey) await recordInboxAction(ctx, { itemKey: opts.itemKey, matterId, action: "confirmed" });
  return row;
}

/* ------------------------------------------------------------------ inbox */
export const inboxActionSchema = z.object({
  itemKey: z.string().min(3).max(200), matterId: z.string().uuid().nullable(),
  action: z.enum(["assigned", "snoozed", "dismissed", "confirmed", "reopened"]),
  assignedTo: z.string().uuid().optional(), snoozeDays: z.number().int().min(1).max(180).optional(), reason: z.string().max(500).optional(),
});

export async function recordInboxAction(ctx: OrgContext, input: z.infer<typeof inboxActionSchema>) {
  if (!ctx.can("inbox.act")) throw new AuthError("forbidden");
  const v = inboxActionSchema.parse(input);
  if (v.action === "dismissed" && !v.reason?.trim()) throw new LedgerError("Give a reason for dismissing this item.");
  return withTenant(ctx.org.id, async (tx) => {
    let assigneeName: string | null = null;
    if (v.action === "assigned") {
      const m = (await tx.select({ name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.organizationId, ctx.org.id), eq(memberships.userId, v.assignedTo ?? ""))).limit(1))[0];
      if (!m) throw new LedgerError("Choose a member of your organization.");
      assigneeName = m.name;
    }
    const snoozeUntil = v.action === "snoozed" ? new Date(Date.now() + (v.snoozeDays ?? 7) * 86400_000) : null;
    await tx.insert(inboxActions).values({ organizationId: ctx.org.id, itemKey: v.itemKey, matterId: v.matterId, action: v.action, assignedTo: v.assignedTo ?? null, snoozeUntil, reason: v.reason?.trim() || null, createdBy: ctx.user.id, createdByLabel: ctx.user.name });
    if (v.action === "dismissed" && v.itemKey.startsWith("moment:")) await resolveMoment(tx, ctx, v.itemKey.slice(7), "dismissed");
    const name = v.matterId ? (await tx.select({ name: matters.name }).from(matters).where(eq(matters.id, v.matterId)).limit(1))[0]?.name : null;
    const what = { assigned: `Assigned review to ${assigneeName}`, snoozed: `Snoozed review for ${v.snoozeDays ?? 7} days`, dismissed: `Dismissed review (${v.reason?.trim()})`, confirmed: "Confirmed no change", reopened: "Reopened review" }[v.action];
    await audit(tx, { ...actor(ctx), action: `inbox.${v.action}`, objectType: v.matterId ? "matter" : undefined, objectId: v.matterId ?? undefined, summary: `${what}${name ? ` on ${name}` : ""}`, metadata: { itemKey: v.itemKey } });
  });
}

/** An attorney marks a material development; it becomes a Decision Moment. */
export async function markDevelopment(ctx: OrgContext, matterId: string, note: string) {
  if (!ctx.can("events.create")) throw new AuthError("forbidden");
  return withTenant(ctx.org.id, async (tx) => {
    const m = (await tx.select().from(matters).where(and(eq(matters.id, matterId), eq(matters.organizationId, ctx.org.id))).limit(1))[0];
    if (!m) throw new LedgerError("Matter not found.");
    if (m.status !== "open") throw new LedgerError("This matter is closed.");
    return fireMoment(tx, ctx, { matterId, matterName: m.name, type: "material_development", source: "manual", note: note.trim().slice(0, 300) || null });
  });
}

/* ------------------------------------------------------------------ review rules */
export const ruleSchema = z.object({
  name: z.string().min(3, "Name the rule.").max(140),
  type: z.enum(Object.keys(RULE_TYPES) as [RuleType, ...RuleType[]]),
  params: z.object({
    pct: z.number().min(0.01).max(5).optional(), days: z.number().int().min(7).max(1000).optional(), months: z.number().int().min(1).max(120).optional(),
    amount: z.number().min(1000).max(1e10).optional(), eventTypes: z.array(z.string()).max(12).optional(),
    referralIds: z.array(z.string().uuid()).max(20).optional(), categoryKeys: z.array(z.string()).max(20).optional(),
  }),
  sourceInsight: z.string().max(120).nullable().optional(),
});

export async function createRule(ctx: OrgContext, input: z.infer<typeof ruleSchema>) {
  if (!ctx.can("rules.manage")) throw new AuthError("forbidden", "Only owners and administrators can create review rules.");
  const v = ruleSchema.parse(input);
  return withTenant(ctx.org.id, async (tx) => {
    const [r] = await tx.insert(reviewRules).values({ organizationId: ctx.org.id, name: v.name, type: v.type, params: v.params, sourceInsight: v.sourceInsight ?? null, createdBy: ctx.user.id, createdByLabel: ctx.user.name }).returning();
    await audit(tx, { ...actor(ctx), action: "rule.created", summary: `Created review rule "${v.name}"`, metadata: { type: v.type, params: v.params, sourceInsight: v.sourceInsight ?? null } });
    return r!;
  });
}

export async function setRuleActive(ctx: OrgContext, ruleId: string, active: boolean) {
  if (!ctx.can("rules.manage")) throw new AuthError("forbidden");
  return withTenant(ctx.org.id, async (tx) => {
    const [r] = await tx.update(reviewRules).set({ active, updatedAt: new Date() }).where(and(eq(reviewRules.id, ruleId), eq(reviewRules.organizationId, ctx.org.id))).returning();
    if (!r) throw new LedgerError("Rule not found.");
    await audit(tx, { ...actor(ctx), action: active ? "rule.activated" : "rule.paused", summary: `${active ? "Activated" : "Paused"} review rule "${r.name}"` });
  });
}

export async function deleteRule(ctx: OrgContext, ruleId: string) {
  if (!ctx.can("rules.manage")) throw new AuthError("forbidden");
  return withTenant(ctx.org.id, async (tx) => {
    const [r] = await tx.delete(reviewRules).where(and(eq(reviewRules.id, ruleId), eq(reviewRules.organizationId, ctx.org.id))).returning();
    if (r) await audit(tx, { ...actor(ctx), action: "rule.deleted", summary: `Deleted review rule "${r.name}"` });
  });
}

/* ------------------------------------------------------------------ decisions */
export const DECISION_TYPES = [
  { key: "accept", label: "Accept matter" },
  { key: "reject", label: "Reject matter" },
  { key: "refer", label: "Refer out" },
  { key: "continue_investment", label: "Continue investment" },
  { key: "approve_expense", label: "Approve major expense" },
  { key: "offer_response", label: "Offer response" },
  { key: "second_review", label: "Second review completed" },
  { key: "other", label: "Other internal decision" },
] as const;
export const decisionSchema = z.object({
  type: z.enum(DECISION_TYPES.map((d) => d.key) as [string, ...string[]]),
  reason: z.string().max(1000).optional(),
  capitalAmount: z.number().min(0).max(1e10).nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
  itemKey: z.string().max(200).nullable().optional(),
});

export async function recordDecision(ctx: OrgContext, matterId: string, input: z.infer<typeof decisionSchema>) {
  if (!ctx.can("decisions.record")) throw new AuthError("forbidden", "Your role does not permit recording firm decisions.");
  const v = decisionSchema.parse(input);
  return withTenant(ctx.org.id, async (tx) => {
    const m = (await tx.select().from(matters).where(and(eq(matters.id, matterId), eq(matters.organizationId, ctx.org.id))).limit(1))[0];
    if (!m) throw new LedgerError("Matter not found.");
    const last = (await tx.select({ id: predictions.id }).from(predictions).where(eq(predictions.matterId, matterId)).orderBy(desc(predictions.version)).limit(1))[0];
    const [d] = await tx.insert(decisions).values({ organizationId: ctx.org.id, matterId, type: v.type, reason: v.reason?.trim() || null, capitalAmount: v.capitalAmount ?? null, eventId: v.eventId ?? null, predictionId: last?.id ?? null, decidedBy: ctx.user.id, decidedLabel: ctx.user.name }).returning();
    const label = DECISION_TYPES.find((x) => x.key === v.type)!.label;
    await audit(tx, { ...actor(ctx), action: "decision.recorded", objectType: "matter", objectId: matterId, summary: `${label} on ${m.name}${v.capitalAmount ? ` ($${Math.round(v.capitalAmount).toLocaleString("en-US")})` : ""}`, metadata: { type: v.type } });
    return d!;
  });
}

/* ------------------------------------------------------------------ declined / referred intake */
export const INTAKE_REASONS = [
  { key: "liability", label: "Liability concerns" }, { key: "damages", label: "Damages too limited" }, { key: "limitations", label: "Limitations or timing" },
  { key: "conflict", label: "Conflict of interest" }, { key: "capacity", label: "Firm capacity" }, { key: "outside_practice", label: "Outside practice area" },
  { key: "client_fit", label: "Client relationship concerns" }, { key: "economics", label: "Expected economics" }, { key: "other", label: "Other" },
] as const;
export const intakeSchema = z.object({
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the intake date."),
  label: z.string().max(160).optional(),
  categoryKey: z.string().max(80).optional(), referralId: z.string().uuid().optional(), attorneyId: z.string().uuid().optional(), jurisdiction: z.string().max(80).optional(),
  disposition: z.enum(["rejected", "referred"]),
  reasonCode: z.enum(INTAKE_REASONS.map((r) => r.key) as [string, ...string[]]),
  note: z.string().max(500).optional(),
  likelihood: z.string().max(40).optional(),
  recoveryLow: z.number().min(0).max(1e11).optional(), recoveryHigh: z.number().min(0).max(1e11).optional(),
});

export async function recordIntake(ctx: OrgContext, input: z.infer<typeof intakeSchema>) {
  if (!ctx.can("intake.record")) throw new AuthError("forbidden");
  const v = intakeSchema.parse(input);
  return withTenant(ctx.org.id, async (tx) => {
    const cat = v.categoryKey ? (await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.organizationId, ctx.org.id), eq(categories.key, v.categoryKey))).limit(1))[0] : undefined;
    const att = v.attorneyId ? (await tx.select({ id: attorneys.id }).from(attorneys).where(and(eq(attorneys.organizationId, ctx.org.id), eq(attorneys.id, v.attorneyId))).limit(1))[0] : undefined;
    const ref = v.referralId ? (await tx.select({ id: referralSources.id }).from(referralSources).where(and(eq(referralSources.organizationId, ctx.org.id), eq(referralSources.id, v.referralId))).limit(1))[0] : undefined;
    const [r] = await tx.insert(intakeDecisions).values({
      organizationId: ctx.org.id, receivedOn: v.receivedOn, label: v.label?.trim() || null, categoryId: cat?.id ?? null, referralSourceId: ref?.id ?? null, attorneyId: att?.id ?? null,
      jurisdiction: v.jurisdiction || null, disposition: v.disposition, reasonCode: v.reasonCode, note: v.note?.trim() || null, likelihood: v.likelihood || null,
      recoveryLow: v.recoveryLow ?? null, recoveryHigh: v.recoveryHigh ?? null, decidedBy: ctx.user.id, decidedLabel: ctx.user.name,
    }).returning();
    await audit(tx, { ...actor(ctx), action: "intake.recorded", summary: `Recorded a ${v.disposition === "rejected" ? "declined" : "referred-out"} intake (${INTAKE_REASONS.find((x) => x.key === v.reasonCode)!.label})` });
    return r!;
  });
}

export async function listIntake(ctx: OrgContext) {
  return withTenant(ctx.org.id, async (tx) => tx.select({ i: intakeDecisions, category: categories.label, referral: referralSources.name, attorney: attorneys.name })
    .from(intakeDecisions).leftJoin(categories, eq(categories.id, intakeDecisions.categoryId)).leftJoin(referralSources, eq(referralSources.id, intakeDecisions.referralSourceId)).leftJoin(attorneys, eq(attorneys.id, intakeDecisions.attorneyId))
    .where(eq(intakeDecisions.organizationId, ctx.org.id)).orderBy(desc(intakeDecisions.receivedOn)).limit(500));
}

/* ------------------------------------------------------------------ firm learning */
export async function monitorPattern(ctx: OrgContext, insightId: string, label: string, on: boolean) {
  if (!ctx.can("rules.manage")) throw new AuthError("forbidden");
  return withTenant(ctx.org.id, async (tx) => {
    if (on) await tx.insert(monitoredPatterns).values({ organizationId: ctx.org.id, insightId, label: label.slice(0, 300), createdBy: ctx.user.id }).onConflictDoNothing();
    else await tx.delete(monitoredPatterns).where(and(eq(monitoredPatterns.organizationId, ctx.org.id), eq(monitoredPatterns.insightId, insightId)));
    await audit(tx, { ...actor(ctx), action: on ? "learning.monitored" : "learning.unmonitored", summary: `${on ? "Monitoring" : "Stopped monitoring"} pattern: ${label.slice(0, 160)}` });
  });
}

/* ------------------------------------------------------------------ matter-level workflow reads */
export async function matterWorkflow(ctx: OrgContext, matterId: string) {
  return withTenant(ctx.org.id, async (tx) => {
    const ds = await tx.select().from(decisions).where(and(eq(decisions.organizationId, ctx.org.id), eq(decisions.matterId, matterId))).orderBy(asc(decisions.decidedAt));
    const ms = await tx.select().from(decisionMoments).where(and(eq(decisionMoments.organizationId, ctx.org.id), eq(decisionMoments.matterId, matterId))).orderBy(asc(decisionMoments.createdAt));
    return { decisions: ds, moments: ms };
  });
}

export async function predictionsByIds(ctx: OrgContext, ids: string[]) {
  if (!ids.length) return [];
  return withTenant(ctx.org.id, async (tx) => tx.select().from(predictions).where(and(eq(predictions.organizationId, ctx.org.id), inArray(predictions.id, ids))));
}
