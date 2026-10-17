import "server-only";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/server/db";
import { attorneys, categories, imports, matters, offers, outcomes, predictions, proceduralEvents, provenance, referralSources, users } from "@/server/db/schema";
import { AuthError, type OrgContext } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { DRIVERS, EVENT_TYPES, RESOLUTIONS, isFavorable } from "@/lib/taxonomy";

const actor = (ctx: OrgContext) => ({ organizationId: ctx.org.id, actorUserId: ctx.user.id, actorLabel: ctx.user.name });
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export class LedgerError extends Error {}

/* ------------------------------------------------------------------ read */
export async function getMatterDetail(ctx: OrgContext, matterId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(matterId)) return null;
  return withTenant(ctx.org.id, async (tx) => {
    const m = (await tx.select().from(matters).where(and(eq(matters.id, matterId), eq(matters.organizationId, ctx.org.id))).limit(1))[0];
    if (!m) return null;
    // Sequential: queries share one transaction connection.
    const cat = m.categoryId ? await tx.select().from(categories).where(eq(categories.id, m.categoryId)).limit(1) : [];
    const att = m.leadAttorneyId ? await tx.select().from(attorneys).where(eq(attorneys.id, m.leadAttorneyId)).limit(1) : [];
    const ref = m.referralSourceId ? await tx.select().from(referralSources).where(eq(referralSources.id, m.referralSourceId)).limit(1) : [];
    const preds = await tx.select().from(predictions).where(and(eq(predictions.matterId, matterId), eq(predictions.organizationId, ctx.org.id))).orderBy(asc(predictions.version));
    const events = await tx.select().from(proceduralEvents).where(and(eq(proceduralEvents.matterId, matterId), eq(proceduralEvents.organizationId, ctx.org.id))).orderBy(asc(proceduralEvents.occurredOn));
    const offs = await tx.select().from(offers).where(and(eq(offers.matterId, matterId), eq(offers.organizationId, ctx.org.id))).orderBy(asc(offers.offeredOn));
    const outcome = await tx.select().from(outcomes).where(and(eq(outcomes.matterId, matterId), eq(outcomes.organizationId, ctx.org.id))).limit(1);
    const prov = await tx.select({ p: provenance, reviewer: users.name }).from(provenance).leftJoin(users, eq(users.id, provenance.reviewedBy)).where(and(eq(provenance.organizationId, ctx.org.id), eq(provenance.entityId, matterId)));
    const imp = m.importId ? await tx.select({ id: imports.id, filename: imports.filename, createdAt: imports.createdAt }).from(imports).where(eq(imports.id, m.importId)).limit(1) : [];
    const outcomeProv = outcome[0]
      ? await tx.select({ p: provenance, reviewer: users.name }).from(provenance).leftJoin(users, eq(users.id, provenance.reviewedBy)).where(and(eq(provenance.organizationId, ctx.org.id), eq(provenance.entityId, outcome[0].id)))
      : [];
    const hideAuthors = ctx.role === "analyst" && !ctx.org.settings.analystsSeePredictionAuthors;
    return {
      matter: m,
      category: cat[0] ?? null,
      attorney: att[0] ?? null,
      referral: ref[0] ?? null,
      predictions: preds.map((p) => (hideAuthors ? { ...p, authorLabel: "Attorney", authorUserId: null, authorAttorneyId: null } : p)),
      events, offers: offs, outcome: outcome[0] ?? null,
      provenance: [...prov, ...outcomeProv].map((x) => ({ ...x.p, reviewerName: x.reviewer })),
      importInfo: imp[0] ?? null,
    };
  });
}

/* ------------------------------------------------------------------ predictions (append-only) */
export const predictionSchema = z.object({
  recoveryLow: z.number().min(0).max(1e11),
  recoveryHigh: z.number().min(0).max(1e11),
  probability: z.number().min(0).max(1),
  expectedDurationMonths: z.number().min(0.5).max(240),
  expectedExpense: z.number().min(0).max(1e10),
  confidence: z.enum(["low", "medium", "high"]),
  drivers: z.array(z.string()).max(3),
  revisionReason: z.string().max(500).optional(),
}).refine((v) => v.recoveryHigh >= v.recoveryLow, { message: "The high estimate must be at least the low estimate.", path: ["recoveryHigh"] })
  .refine((v) => v.drivers.every((d) => DRIVERS.some((x) => x.key === d)), { message: "Choose drivers from the list.", path: ["drivers"] });

export type PredictionInput = z.infer<typeof predictionSchema>;

/**
 * Records a prediction as a NEW row. An existing prediction is never updated:
 * a revision increments `version` and references the row it supersedes.
 */
export async function recordPrediction(ctx: OrgContext, matterId: string, input: PredictionInput) {
  const sandbox = ctx.role === "demo";
  if (!sandbox && !ctx.can("predictions.create")) throw new AuthError("forbidden", "Your role does not permit recording predictions.");
  if (sandbox && !ctx.org.isDemo) throw new AuthError("forbidden");
  return withTenant(ctx.org.id, async (tx) => {
    const m = (await tx.select().from(matters).where(and(eq(matters.id, matterId), eq(matters.organizationId, ctx.org.id))).limit(1))[0];
    if (!m) throw new LedgerError("Matter not found.");
    if (m.status !== "open") throw new LedgerError("Predictions are recorded before an outcome is known. This matter is closed.");
    const prev = (await tx.select().from(predictions).where(eq(predictions.matterId, matterId)).orderBy(desc(predictions.version)).limit(1))[0];
    if (prev && !input.revisionReason?.trim()) throw new LedgerError("Record what new information prompted this revision.");
    const [row] = await tx.insert(predictions).values({
      organizationId: ctx.org.id, matterId, version: (prev?.version ?? 0) + 1,
      authorUserId: ctx.user.id, authorAttorneyId: ctx.attorneyId, authorLabel: ctx.user.name,
      recoveryLow: input.recoveryLow, recoveryHigh: input.recoveryHigh, probability: Math.round(input.probability * 10000) / 10000,
      expectedDurationMonths: input.expectedDurationMonths, expectedExpense: input.expectedExpense, confidence: input.confidence,
      drivers: input.drivers, proceduralStage: m.proceduralStage, revisionReason: input.revisionReason?.trim() || null,
      source: sandbox ? "sandbox" : "prospective", supersedesId: prev?.id ?? null,
    }).returning();
    await audit(tx, {
      ...actor(ctx), action: prev ? "prediction.revised" : "prediction.created", objectType: "matter", objectId: matterId,
      summary: `${prev ? "Revised" : "Recorded"} prediction v${row!.version} on ${m.name}: ${usd(input.recoveryLow)}–${usd(input.recoveryHigh)}, ${Math.round(input.probability * 100)}% favorable`,
      metadata: { version: row!.version, sandbox },
    });
    return row!;
  });
}

/* ------------------------------------------------------------------ events and offers */
export const eventSchema = z.object({
  type: z.enum(EVENT_TYPES.map((e) => e.key) as [string, ...string[]]),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(2).max(160),
  description: z.string().max(1000).optional(),
  amount: z.number().min(0).max(1e10).optional(),
});

export async function addEvent(ctx: OrgContext, matterId: string, input: z.infer<typeof eventSchema>) {
  if (!ctx.can("events.create")) throw new AuthError("forbidden");
  return withTenant(ctx.org.id, async (tx) => {
    const m = (await tx.select().from(matters).where(and(eq(matters.id, matterId), eq(matters.organizationId, ctx.org.id))).limit(1))[0];
    if (!m) throw new LedgerError("Matter not found.");
    const [ev] = await tx.insert(proceduralEvents).values({ organizationId: ctx.org.id, matterId, type: input.type as (typeof proceduralEvents.$inferInsert)["type"], occurredOn: input.occurredOn, title: input.title, description: input.description ?? null, amount: input.amount ?? null, createdBy: ctx.user.id }).returning();
    if (input.type === "expert_expense" && input.amount) {
      await tx.update(matters).set({ expensesToDate: (m.expensesToDate ?? 0) + input.amount, updatedAt: new Date() }).where(eq(matters.id, matterId));
    }
    await audit(tx, { ...actor(ctx), action: "event.created", objectType: "matter", objectId: matterId, summary: `Added "${input.title}" to ${m.name}` });
    return ev!;
  });
}

export const offerSchema = z.object({
  direction: z.enum(["defense_offer", "plaintiff_demand"]),
  amount: z.number().min(0).max(1e11),
  offeredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional(),
});

export async function addOffer(ctx: OrgContext, matterId: string, input: z.infer<typeof offerSchema>) {
  if (!ctx.can("events.create")) throw new AuthError("forbidden");
  return withTenant(ctx.org.id, async (tx) => {
    const m = (await tx.select().from(matters).where(and(eq(matters.id, matterId), eq(matters.organizationId, ctx.org.id))).limit(1))[0];
    if (!m) throw new LedgerError("Matter not found.");
    const [o] = await tx.insert(offers).values({ organizationId: ctx.org.id, matterId, ...input, notes: input.notes ?? null, createdBy: ctx.user.id }).returning();
    await audit(tx, { ...actor(ctx), action: "offer.recorded", objectType: "matter", objectId: matterId, summary: `Recorded ${input.direction === "defense_offer" ? "defense offer" : "demand"} of ${usd(input.amount)} on ${m.name}` });
    return o!;
  });
}

/* ------------------------------------------------------------------ financials and outcome */
export const financialSchema = z.object({ expensesToDate: z.number().min(0).max(1e10).nullable(), attorneyHours: z.number().min(0).max(1e6).nullable() });

export async function updateFinancials(ctx: OrgContext, matterId: string, input: z.infer<typeof financialSchema>) {
  if (!ctx.can("matters.edit")) throw new AuthError("forbidden");
  return withTenant(ctx.org.id, async (tx) => {
    const m = (await tx.select().from(matters).where(and(eq(matters.id, matterId), eq(matters.organizationId, ctx.org.id))).limit(1))[0];
    if (!m) throw new LedgerError("Matter not found.");
    await tx.update(matters).set({ ...input, updatedAt: new Date() }).where(eq(matters.id, matterId));
    for (const [field, before, after] of [["expenses_to_date", m.expensesToDate, input.expensesToDate], ["attorney_hours", m.attorneyHours, input.attorneyHours]] as const) {
      if (before !== after) await tx.insert(provenance).values({ organizationId: ctx.org.id, entityType: "matter", entityId: matterId, field, originalValue: before == null ? null : String(before), normalizedValue: after == null ? null : String(after), source: "manually_corrected", method: "manual", reviewedBy: ctx.user.id, reviewedAt: new Date() });
    }
    await audit(tx, { ...actor(ctx), action: "matter.edited", objectType: "matter", objectId: matterId, summary: `Updated financials on ${m.name}`, metadata: { fields: Object.keys(input) } });
  });
}

export const outcomeSchema = z.object({
  resolutionType: z.enum(RESOLUTIONS.map((r) => r.key) as [string, ...string[]]),
  resolvedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  grossRecovery: z.number().min(0).max(1e11).nullable(),
  attorneyFee: z.number().min(0).max(1e11).nullable(),
  referralFeePaid: z.number().min(0).max(1e11).nullable(),
  litigationExpenses: z.number().min(0).max(1e10).nullable(),
  netToClient: z.number().min(0).max(1e11).nullable(),
  attorneyHours: z.number().min(0).max(1e6).nullable(),
  notes: z.string().max(2000).optional(),
});

/** Records (or corrects) the outcome and closes the matter. Corrections are provenance-tracked and audited. */
export async function recordOutcome(ctx: OrgContext, matterId: string, input: z.infer<typeof outcomeSchema>) {
  if (!ctx.can("outcomes.record")) throw new AuthError("forbidden");
  return withTenant(ctx.org.id, async (tx) => {
    const m = (await tx.select().from(matters).where(and(eq(matters.id, matterId), eq(matters.organizationId, ctx.org.id))).limit(1))[0];
    if (!m) throw new LedgerError("Matter not found.");
    if (m.openedOn && input.resolvedOn < m.openedOn) throw new LedgerError("The resolution date is before the matter was opened.");
    const favorable = isFavorable(input.resolutionType, input.grossRecovery);
    const existing = (await tx.select().from(outcomes).where(eq(outcomes.matterId, matterId)).limit(1))[0];
    const values = { ...input, resolutionType: input.resolutionType as (typeof outcomes.$inferInsert)["resolutionType"], favorable, notes: input.notes ?? null, recordedBy: ctx.user.id, updatedAt: new Date() };
    let outcomeId: string;
    if (existing) {
      await tx.update(outcomes).set(values).where(eq(outcomes.id, existing.id));
      outcomeId = existing.id;
      for (const k of ["grossRecovery", "attorneyFee", "litigationExpenses", "netToClient", "resolutionType", "resolvedOn"] as const) {
        const before = existing[k], after = values[k];
        if (String(before ?? "") !== String(after ?? "")) {
          await tx.insert(provenance).values({ organizationId: ctx.org.id, entityType: "outcome", entityId: outcomeId, field: k, originalValue: before == null ? null : String(before), normalizedValue: after == null ? null : String(after), source: "manually_corrected", method: "manual", reviewedBy: ctx.user.id, reviewedAt: new Date() });
        }
      }
    } else {
      outcomeId = (await tx.insert(outcomes).values({ organizationId: ctx.org.id, matterId, ...values }).returning())[0]!.id;
    }
    await tx.update(matters).set({ status: "closed", closedOn: input.resolvedOn, proceduralStage: "Resolved", updatedAt: new Date() }).where(eq(matters.id, matterId));
    await audit(tx, { ...actor(ctx), action: existing ? "outcome.corrected" : "outcome.recorded", objectType: "matter", objectId: matterId, summary: `${existing ? "Corrected" : "Recorded"} outcome on ${m.name}: ${input.resolutionType.replace(/_/g, " ")}${input.grossRecovery != null ? `, ${usd(input.grossRecovery)} gross` : ""}` });
    return { outcomeId, favorable };
  });
}

export async function nextPredictionVersion(ctx: OrgContext, matterId: string) {
  return withTenant(ctx.org.id, async (tx) => {
    const r = await tx.select({ v: max(predictions.version) }).from(predictions).where(eq(predictions.matterId, matterId));
    return (r[0]?.v ?? 0) + 1;
  });
}

/* ------------------------------------------------------------------ new matter */
export const newMatterSchema = z.object({
  name: z.string().min(2, "Enter the matter name.").max(200),
  externalId: z.string().max(80).optional(),
  categoryKey: z.string().max(80).optional(),
  leadAttorneyId: z.string().uuid().optional(),
  referralName: z.string().max(160).optional(),
  jurisdiction: z.string().max(80).optional(),
  court: z.string().max(160).optional(),
  openedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the date opened."),
  proceduralStage: z.string().max(60).optional(),
});

export async function createMatter(ctx: OrgContext, input: z.infer<typeof newMatterSchema>) {
  if (!ctx.can("matters.edit") || ctx.org.isDemo) throw new AuthError("forbidden", ctx.org.isDemo ? "New matters cannot be added to the demonstration workspace." : undefined);
  return withTenant(ctx.org.id, async (tx) => {
    if (input.externalId) {
      const dup = (await tx.select({ id: matters.id }).from(matters).where(and(eq(matters.organizationId, ctx.org.id), eq(matters.externalId, input.externalId))).limit(1))[0];
      if (dup) throw new LedgerError(`A matter with ID ${input.externalId} already exists.`);
    }
    const cat = input.categoryKey ? (await tx.select().from(categories).where(and(eq(categories.organizationId, ctx.org.id), eq(categories.key, input.categoryKey))).limit(1))[0] : undefined;
    const att = input.leadAttorneyId ? (await tx.select().from(attorneys).where(and(eq(attorneys.organizationId, ctx.org.id), eq(attorneys.id, input.leadAttorneyId))).limit(1))[0] : undefined;
    let refId: string | null = null;
    if (input.referralName) {
      const existing = (await tx.select().from(referralSources).where(and(eq(referralSources.organizationId, ctx.org.id), eq(referralSources.name, input.referralName))).limit(1))[0];
      refId = existing?.id ?? (await tx.insert(referralSources).values({ organizationId: ctx.org.id, name: input.referralName }).returning())[0]!.id;
    }
    const [m] = await tx.insert(matters).values({
      organizationId: ctx.org.id, name: input.name, externalId: input.externalId || null, status: "open", categoryId: cat?.id ?? null,
      leadAttorneyId: att?.id ?? null, referralSourceId: refId, jurisdiction: input.jurisdiction || null, court: input.court || null,
      openedOn: input.openedOn, proceduralStage: input.proceduralStage || "Intake",
    }).returning();
    await tx.insert(proceduralEvents).values({ organizationId: ctx.org.id, matterId: m!.id, type: "matter_opened", occurredOn: input.openedOn, title: "Matter opened", createdBy: ctx.user.id });
    await tx.insert(provenance).values({ organizationId: ctx.org.id, entityType: "matter", entityId: m!.id, field: "matter", normalizedValue: input.name, source: "attorney_entered", method: "manual", reviewedBy: ctx.user.id, reviewedAt: new Date() });
    await audit(tx, { ...actor(ctx), action: "matter.created", objectType: "matter", objectId: m!.id, summary: `Added matter ${input.name}` });
    return m!;
  });
}
