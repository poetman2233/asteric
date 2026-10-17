import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { withTenant, type Tx } from "@/server/db";
import {
  attorneys, categories, importFiles, importRows, importValueReviews, imports, matters, outcomes, predictions, provenance, referralSources,
} from "@/server/db/schema";
import type { OrgContext } from "@/server/auth/session";
import { audit } from "@/server/audit";
import { parseUpload } from "./file";
import { suggestMapping, detectSourceSystem, type ColumnMapping } from "@/lib/imports/mapping";
import { CANONICAL_FIELDS, FIELD_BY_KEY } from "@/lib/imports/fields";
import { AUTO_ACCEPT, clusterNames, normalizeCategory, normalizeResolution, normalizeStatus, type CategoryOption, type Normalized } from "@/lib/imports/normalize";
import { cellToString, isEmpty, parseDate, parseMoney, parseNumber, parsePercent } from "@/lib/imports/values";
import { normText } from "@/lib/imports/text";
import { looksLike } from "@/lib/imports/values";
import { getAiProvider, type ColumnHint } from "@/server/ai/provider";
import { logger } from "@/server/logger";
import { DEFAULT_CATEGORIES, isFavorable } from "@/lib/taxonomy";

export type StoredMapping = { columns: ColumnMapping[] };
export type RowIssue = { field?: string; kind: "unparseable" | "duplicate_in_file" | "duplicate_existing" | "missing_identity" | "closed_without_date"; detail: string };

const REVIEW_FIELDS = ["category", "status", "resolution_type", "lead_attorney", "referral_source"] as const;
type ReviewField = (typeof REVIEW_FIELDS)[number];

const actor = (ctx: OrgContext) => ({ organizationId: ctx.org.id, actorUserId: ctx.user.id, actorLabel: ctx.user.name });
const IMPORTANT = ["name", "external_id", "status", "category", "lead_attorney", "referral_source", "opened_on", "closed_on", "resolution_type", "gross_recovery", "attorney_fee", "litigation_expenses"];

/* ------------------------------------------------------------------ 1. upload */
export async function createImport(ctx: OrgContext, file: { name: string; bytes: Buffer }, opts: { force?: boolean } = {}) {
  const sheet = await parseUpload(file.name, file.bytes);
  const sha256 = createHash("sha256").update(file.bytes).digest("hex");
  let columns = suggestMapping(sheet.headers, sheet.rows);
  columns = await aiAssist(ctx, columns, sheet.rows);
  return withTenant(ctx.org.id, async (tx) => {
    if (!opts.force) {
      const dup = (await tx.select({ id: imports.id, createdAt: imports.createdAt, filename: imports.filename }).from(imports)
        .where(and(eq(imports.organizationId, ctx.org.id), eq(imports.sha256, sha256), eq(imports.status, "completed"))).limit(1))[0];
      if (dup) return { duplicateOf: dup } as const;
    }
    const id = randomUUID();
    await tx.insert(imports).values({
      id, organizationId: ctx.org.id, filename: file.name.slice(0, 200), fileSize: file.bytes.length, mime: sheet.mime, sha256,
      status: "uploaded", sourceSystem: detectSourceSystem(sheet.headers), rowCount: sheet.rows.length,
      columnHeaders: sheet.headers, mapping: { columns } satisfies StoredMapping, createdBy: ctx.user.id,
    });
    await tx.insert(importFiles).values({ importId: id, organizationId: ctx.org.id, data: file.bytes });
    for (let i = 0; i < sheet.rows.length; i += 500) {
      await tx.insert(importRows).values(sheet.rows.slice(i, i + 500).map((raw, j) => ({ organizationId: ctx.org.id, importId: id, rowNumber: i + j + 2, raw })));
    }
    await audit(tx, { ...actor(ctx), action: "import.started", summary: `Uploaded ${file.name} (${sheet.rows.length} rows)`, objectType: "import", objectId: id, metadata: { rows: sheet.rows.length, kind: sheet.kind } });
    return { importId: id } as const;
  });
}

/**
 * Optional AI assistance for columns the deterministic matcher could not place.
 * Sends headers and inferred types only. AI suggestions are capped below the
 * auto-accept threshold and labelled, so a person always confirms them.
 */
async function aiAssist(ctx: OrgContext, columns: ColumnMapping[], rows: Record<string, unknown>[]): Promise<ColumnMapping[]> {
  const ai = getAiProvider();
  if (!ai || !ctx.org.settings.aiAssistEnabled) return columns;
  const weak = columns.filter((c) => c.confidence < 0.6);
  if (!weak.length) return columns;
  const infer = (h: string): ColumnHint["inferredType"] => {
    const vals = rows.slice(0, 30).map((r) => r[h]).filter((v) => !isEmpty(v));
    if (!vals.length) return "empty";
    for (const k of ["date", "money", "percent", "number"] as const) if (vals.filter((v) => looksLike(k, v)).length / vals.length >= 0.8) return k;
    return "text";
  };
  const suggestions = await ai.suggestColumnMappings(weak.map((c) => ({ header: c.column, inferredType: infer(c.column) })));
  const used = new Set(columns.filter((c) => c.field && c.confidence >= 0.6).map((c) => c.field!));
  let applied = 0;
  const out = columns.map((c) => {
    if (c.confidence >= 0.6) return c;
    const s = suggestions.find((x) => x.header === c.column);
    if (!s?.field || used.has(s.field) || s.confidence < 0.5) return c;
    used.add(s.field);
    applied++;
    return { ...c, field: s.field, method: "ai" as const, confidence: Math.min(0.75, Math.round(s.confidence * 100) / 100) };
  });
  logger.info("ai.mapping_assist", { provider: ai.name, requested: weak.length, applied });
  return out;
}

/* ------------------------------------------------------------------ helpers */
async function loadImport(tx: Tx, orgId: string, importId: string) {
  const imp = (await tx.select().from(imports).where(and(eq(imports.id, importId), eq(imports.organizationId, orgId))).limit(1))[0];
  if (!imp) throw new Error("Import not found");
  return imp;
}

function columnFor(mapping: StoredMapping): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of mapping.columns) if (c.field) out[c.field] = c.column;
  return out;
}

async function categoryOptions(tx: Tx, orgId: string): Promise<(CategoryOption & { id: string })[]> {
  const rows = await tx.select().from(categories).where(and(eq(categories.organizationId, orgId), eq(categories.active, true))).orderBy(asc(categories.sort));
  const synonyms = new Map(Object.values(DEFAULT_CATEGORIES).flat().map((c) => [c.key, c.synonyms]));
  return rows.map((r) => ({ id: r.id, key: r.key, label: r.label, synonyms: synonyms.get(r.key) ?? [] }));
}

export function validateMapping(columns: ColumnMapping[]): string | null {
  const fields = columns.map((c) => c.field).filter((f): f is string => Boolean(f));
  if (fields.some((f) => !FIELD_BY_KEY[f])) return "The mapping contains an unknown field.";
  const dup = fields.find((f, i) => fields.indexOf(f) !== i);
  if (dup) return `"${FIELD_BY_KEY[dup]!.label}" is mapped to more than one column. Each field can be mapped once.`;
  if (!fields.includes("name") && !fields.includes("external_id")) return "Map at least a matter name or a matter ID column.";
  return null;
}

/* ------------------------------------------------------------------ 2. mapping → review */
export async function saveMappingAndBuildReview(ctx: OrgContext, importId: string, assignments: Record<string, string | null>) {
  return withTenant(ctx.org.id, async (tx) => {
    const imp = await loadImport(tx, ctx.org.id, importId);
    if (!["uploaded", "mapped", "reviewing"].includes(imp.status)) throw new Error("This import can no longer be changed.");
    const prev = imp.mapping as StoredMapping;
    const columns: ColumnMapping[] = prev.columns.map((c) => {
      const next = assignments[c.column] ?? null;
      return next === c.field ? c : { ...c, field: next, method: next ? "manual" : "none", confidence: next ? 1 : 0 };
    });
    const problem = validateMapping(columns);
    if (problem) return { error: problem };
    const col = columnFor({ columns });
    const rows = await tx.select().from(importRows).where(eq(importRows.importId, importId)).orderBy(asc(importRows.rowNumber));
    const raw = (r: (typeof rows)[number], field: string) => (col[field] ? (r.raw as Record<string, unknown>)[col[field]!] : null);

    // Distinct values per reviewable field.
    const counts = new Map<ReviewField, Map<string, number>>();
    for (const f of REVIEW_FIELDS) counts.set(f, new Map());
    for (const r of rows) {
      for (const f of REVIEW_FIELDS) {
        const v = cellToString(raw(r, f));
        if (!v) continue;
        counts.get(f)!.set(v, (counts.get(f)!.get(v) ?? 0) + 1);
      }
    }
    const cats = await categoryOptions(tx, ctx.org.id);
    const existingAtt = (await tx.select({ name: attorneys.name }).from(attorneys).where(eq(attorneys.organizationId, ctx.org.id))).map((a) => a.name);
    const existingRef = (await tx.select({ name: referralSources.name }).from(referralSources).where(eq(referralSources.organizationId, ctx.org.id))).map((a) => a.name);
    const suggestions: { field: ReviewField; value: string; count: number; n: Normalized }[] = [];
    for (const [v, c] of counts.get("category")!) suggestions.push({ field: "category", value: v, count: c, n: normalizeCategory(v, cats) });
    for (const [v, c] of counts.get("status")!) suggestions.push({ field: "status", value: v, count: c, n: normalizeStatus(v, false) });
    for (const [v, c] of counts.get("resolution_type")!) suggestions.push({ field: "resolution_type", value: v, count: c, n: normalizeResolution(v) });
    const att = clusterNames([...counts.get("lead_attorney")!].map(([raw, count]) => ({ raw, count })), existingAtt, true);
    for (const [v, c] of counts.get("lead_attorney")!) suggestions.push({ field: "lead_attorney", value: v, count: c, n: att.get(v)! });
    const ref = clusterNames([...counts.get("referral_source")!].map(([raw, count]) => ({ raw, count })), existingRef, false);
    for (const [v, c] of counts.get("referral_source")!) suggestions.push({ field: "referral_source", value: v, count: c, n: ref.get(v)! });

    await tx.delete(importValueReviews).where(eq(importValueReviews.importId, importId));
    for (let i = 0; i < suggestions.length; i += 500) {
      await tx.insert(importValueReviews).values(suggestions.slice(i, i + 500).map((s) => ({
        organizationId: ctx.org.id, importId, field: s.field, originalValue: s.value.slice(0, 500), suggestedValue: s.n.value,
        confidence: s.n.confidence, method: s.n.method, occurrences: s.count,
        decision: s.n.confidence >= AUTO_ACCEPT ? ("accepted" as const) : ("pending" as const),
        finalValue: s.n.confidence >= AUTO_ACCEPT ? s.n.value : null,
      })));
    }

    // Row-level checks: identity, duplicates, unparseable values.
    const existingIds = new Set((await tx.select({ e: matters.externalId }).from(matters).where(and(eq(matters.organizationId, ctx.org.id), isNotNull(matters.externalId)))).map((m) => normText(m.e!)));
    const seen = new Map<string, number>();
    const unparseable: Record<string, number> = {};
    let duplicates = 0, errors = 0;
    for (const r of rows) {
      const issues: RowIssue[] = [];
      const ext = cellToString(raw(r, "external_id"));
      const name = cellToString(raw(r, "name"));
      if (!ext && !name) issues.push({ kind: "missing_identity", detail: "No matter name or ID" });
      const key = ext ? `id:${normText(ext)}` : `n:${normText(name)}|${parseDate(raw(r, "opened_on")) ?? ""}`;
      if (ext && existingIds.has(normText(ext))) issues.push({ kind: "duplicate_existing", detail: `Matter ID ${ext} already exists in your workspace` });
      else if ((ext || name) && seen.has(key)) issues.push({ kind: "duplicate_in_file", detail: `Same matter as row ${seen.get(key)}` });
      else seen.set(key, r.rowNumber);
      for (const f of CANONICAL_FIELDS) {
        const v = raw(r, f.key);
        if (isEmpty(v)) continue;
        const ok = f.kind === "money" ? parseMoney(v) != null : f.kind === "date" ? parseDate(v) != null : f.kind === "percent" ? parsePercent(v) != null : f.kind === "number" ? parseNumber(v) != null : true;
        if (!ok) { issues.push({ field: f.key, kind: "unparseable", detail: `${f.label}: "${cellToString(v).slice(0, 40)}" could not be read` }); unparseable[f.key] = (unparseable[f.key] ?? 0) + 1; }
      }
      const status = issues.some((i) => i.kind === "missing_identity") ? "error" : issues.some((i) => i.kind.startsWith("duplicate")) ? "duplicate" : "ok";
      if (status === "error") errors++;
      if (status === "duplicate") duplicates++;
      await tx.update(importRows).set({ status, issues }).where(eq(importRows.id, r.id));
    }
    const mappedFields = columns.filter((c) => c.field).map((c) => c.field!);
    const preview = {
      rowsParsed: rows.length,
      fieldsRecognized: mappedFields.length,
      unmappedColumns: columns.filter((c) => !c.field).map((c) => c.column),
      missingFields: IMPORTANT.filter((f) => !mappedFields.includes(f)).map((f) => FIELD_BY_KEY[f]!.label),
      valuesNeedingReview: suggestions.filter((s) => s.n.confidence < AUTO_ACCEPT).length,
      valuesAutoNormalized: suggestions.filter((s) => s.n.confidence >= AUTO_ACCEPT).length,
      possibleDuplicates: duplicates,
      errorRows: errors,
      unparseable,
    };
    await tx.update(imports).set({ mapping: { columns } satisfies StoredMapping, status: "reviewing", report: { stage: "preview", ...preview } }).where(eq(imports.id, importId));
    await audit(tx, { ...actor(ctx), action: "import.mapped", summary: `Confirmed column mapping for ${imp.filename}`, objectType: "import", objectId: importId, metadata: { fields: mappedFields.length } });
    return { ok: true as const };
  });
}

/* ------------------------------------------------------------------ 3. human review */
export async function decideReview(ctx: OrgContext, importId: string, reviewId: string, finalValue: string | null) {
  return withTenant(ctx.org.id, async (tx) => {
    const imp = await loadImport(tx, ctx.org.id, importId);
    if (imp.status !== "reviewing") throw new Error("This import is not awaiting review.");
    const rev = (await tx.select().from(importValueReviews).where(and(eq(importValueReviews.id, reviewId), eq(importValueReviews.importId, importId))).limit(1))[0];
    if (!rev) throw new Error("Review item not found");
    const value = finalValue?.trim() ? finalValue.trim().slice(0, 200) : null;
    await tx.update(importValueReviews).set({
      decision: value === rev.suggestedValue ? "accepted" : "corrected", finalValue: value, reviewedBy: ctx.user.id, reviewedAt: new Date(),
    }).where(eq(importValueReviews.id, reviewId));
    await audit(tx, { ...actor(ctx), action: "import.mapping_approved", summary: `Reviewed ${rev.field.replace("_", " ")} value "${rev.originalValue.slice(0, 60)}"`, objectType: "import", objectId: importId, metadata: { field: rev.field, corrected: value !== rev.suggestedValue } });
  });
}

export async function acceptAllSuggestions(ctx: OrgContext, importId: string) {
  return withTenant(ctx.org.id, async (tx) => {
    const imp = await loadImport(tx, ctx.org.id, importId);
    if (imp.status !== "reviewing") throw new Error("This import is not awaiting review.");
    const pending = await tx.select().from(importValueReviews).where(and(eq(importValueReviews.importId, importId), eq(importValueReviews.decision, "pending")));
    for (const p of pending) {
      await tx.update(importValueReviews).set({ decision: "accepted", finalValue: p.suggestedValue, reviewedBy: ctx.user.id, reviewedAt: new Date() }).where(eq(importValueReviews.id, p.id));
    }
    await audit(tx, { ...actor(ctx), action: "import.mapping_approved", summary: `Accepted ${pending.length} suggested values for ${imp.filename}`, objectType: "import", objectId: importId, metadata: { count: pending.length } });
    return pending.length;
  });
}

export async function cancelImport(ctx: OrgContext, importId: string) {
  return withTenant(ctx.org.id, async (tx) => {
    const imp = await loadImport(tx, ctx.org.id, importId);
    if (imp.status === "completed") throw new Error("Completed imports cannot be cancelled.");
    await tx.update(imports).set({ status: "cancelled" }).where(eq(imports.id, importId));
    await tx.delete(importFiles).where(eq(importFiles.importId, importId));
    await audit(tx, { ...actor(ctx), action: "import.cancelled", summary: `Cancelled import of ${imp.filename}`, objectType: "import", objectId: importId });
  });
}

/* ------------------------------------------------------------------ 4. commit */
export async function commitImport(ctx: OrgContext, importId: string, opts: { skipDuplicates: boolean }) {
  return withTenant(ctx.org.id, async (tx) => {
    const imp = await loadImport(tx, ctx.org.id, importId);
    if (imp.status !== "reviewing") throw new Error("This import is not ready to commit.");
    const reviews = await tx.select().from(importValueReviews).where(eq(importValueReviews.importId, importId));
    if (reviews.some((r) => r.decision === "pending")) return { error: "Some values still need review before the import can be committed." };
    await tx.update(imports).set({ status: "committing" }).where(eq(imports.id, importId));

    const mapping = imp.mapping as StoredMapping;
    const col = columnFor(mapping);
    const methodOf = Object.fromEntries(mapping.columns.filter((c) => c.field).map((c) => [c.field!, c]));
    const decided = new Map(reviews.map((r) => [`${r.field}\u0000${r.originalValue}`, r]));
    const cats = await categoryOptions(tx, ctx.org.id);
    const catId = new Map(cats.map((c) => [c.key, c.id]));

    // Resolve people and sources to records, creating new ones as needed.
    const nameToId = async (table: typeof attorneys | typeof referralSources, label: string) => {
      const found = (await tx.select({ id: table.id }).from(table).where(and(eq(table.organizationId, ctx.org.id), eq(table.name, label))).limit(1))[0];
      if (found) return found.id;
      const id = randomUUID();
      await tx.insert(table).values({ id, organizationId: ctx.org.id, name: label });
      return id;
    };
    const attCache = new Map<string, string>(), refCache = new Map<string, string>();

    const rows = await tx.select().from(importRows).where(eq(importRows.importId, importId)).orderBy(asc(importRows.rowNumber));
    const matterVals: (typeof matters.$inferInsert)[] = [];
    const outcomeVals: (typeof outcomes.$inferInsert)[] = [];
    const predVals: (typeof predictions.$inferInsert)[] = [];
    const provVals: (typeof provenance.$inferInsert)[] = [];
    const rowUpdates: { id: string; matterId: string | null; status: string }[] = [];
    let created = 0, skipped = 0, errorRows = 0, reviewedRows = 0, autoRows = 0;

    for (const r of rows) {
      const rec = r.raw as Record<string, unknown>;
      const raw = (f: string) => (col[f] ? rec[col[f]!] : null);
      if (r.status === "error") { errorRows++; rowUpdates.push({ id: r.id, matterId: null, status: "error" }); continue; }
      if (r.status === "duplicate" && opts.skipDuplicates) { skipped++; rowUpdates.push({ id: r.id, matterId: null, status: "skipped" }); continue; }

      let humanReviewed = false;
      const review = (field: ReviewField) => {
        const v = cellToString(raw(field));
        if (!v) return { value: null as string | null, rev: undefined };
        const rev = decided.get(`${field}\u0000${v.slice(0, 500)}`);
        if (rev?.reviewedBy) humanReviewed = true;
        return { value: rev?.finalValue ?? null, rev };
      };
      const matterId = randomUUID();
      const prov = (entityType: string, entityId: string, field: string, original: unknown, normalized: unknown, rev?: (typeof reviews)[number]) => {
        if (isEmpty(original)) return;
        provVals.push({
          organizationId: ctx.org.id, entityType, entityId, field, originalValue: cellToString(original).slice(0, 500),
          normalizedValue: normalized == null ? null : String(normalized).slice(0, 500), source: "import", importId,
          confidence: rev ? rev.confidence : methodOf[field]?.confidence ?? null, method: rev ? rev.method : "parsed",
          reviewedBy: rev?.reviewedBy ?? null, reviewedAt: rev?.reviewedAt ?? null,
        });
      };

      const ext = cellToString(raw("external_id")) || null;
      const name = cellToString(raw("name")) || (ext ? `Matter ${ext}` : "Untitled matter");
      const cat = review("category");
      const statusRev = review("status");
      const resRev = review("resolution_type");
      const att = review("lead_attorney");
      const ref = review("referral_source");
      const opened = parseDate(raw("opened_on"));
      const closed = parseDate(raw("closed_on"));
      const resolvedOn = parseDate(raw("resolved_on")) ?? closed;
      const gross = parseMoney(raw("gross_recovery"));
      const status = (statusRev.value === "open" || statusRev.value === "closed" ? statusRev.value : (closed || resRev.value ? "closed" : "open")) as "open" | "closed";
      let attorneyId: string | null = null;
      if (att.value) { attorneyId = attCache.get(att.value) ?? (await nameToId(attorneys, att.value)); attCache.set(att.value, attorneyId); }
      let referralId: string | null = null;
      if (ref.value) { referralId = refCache.get(ref.value) ?? (await nameToId(referralSources, ref.value)); refCache.set(ref.value, referralId); }
      const expenses = parseMoney(raw("litigation_expenses")) ?? parseMoney(raw("expenses_to_date"));
      const hours = parseNumber(raw("attorney_hours"));

      matterVals.push({
        id: matterId, organizationId: ctx.org.id, externalId: ext, name: name.slice(0, 300), status,
        categoryId: cat.value ? catId.get(cat.value) ?? null : null, originalCategory: cellToString(raw("category")) || null,
        jurisdiction: cellToString(raw("jurisdiction")) || null, court: cellToString(raw("court")) || null,
        leadAttorneyId: attorneyId, referralSourceId: referralId, clientRef: cellToString(raw("client_ref")) || null,
        openedOn: opened, closedOn: status === "closed" ? closed ?? resolvedOn : null,
        proceduralStage: cellToString(raw("procedural_stage")) || (status === "closed" ? "Resolved" : null),
        defendantIndustry: cellToString(raw("defendant_industry")) || null, defendantSize: cellToString(raw("defendant_size")) || null,
        expensesToDate: expenses, attorneyHours: hours, notes: cellToString(raw("notes")).slice(0, 4000) || null, importId,
        possibleDuplicateOf: null,
      });
      prov("matter", matterId, "category", raw("category"), cat.value, cat.rev);
      prov("matter", matterId, "status", raw("status"), status, statusRev.rev);
      prov("matter", matterId, "lead_attorney", raw("lead_attorney"), att.value, att.rev);
      prov("matter", matterId, "referral_source", raw("referral_source"), ref.value, ref.rev);
      prov("matter", matterId, "opened_on", raw("opened_on"), opened);
      prov("matter", matterId, "expenses", raw("litigation_expenses") ?? raw("expenses_to_date"), expenses);

      if (status === "closed" && resolvedOn && (resRev.value || gross != null)) {
        const resolutionType = resRev.value ?? (gross && gross > 0 ? "settlement" : "other");
        const outcomeId = randomUUID();
        const fee = parseMoney(raw("attorney_fee"));
        outcomeVals.push({
          id: outcomeId, organizationId: ctx.org.id, matterId, resolutionType: resolutionType as (typeof outcomes.$inferInsert)["resolutionType"],
          favorable: isFavorable(resolutionType, gross), resolvedOn, grossRecovery: gross, attorneyFee: fee,
          referralFeePaid: parseMoney(raw("referral_fee_paid")), litigationExpenses: expenses, netToClient: parseMoney(raw("net_to_client")),
          attorneyHours: hours, recordedBy: ctx.user.id,
        });
        prov("outcome", outcomeId, "resolution_type", raw("resolution_type"), resolutionType, resRev.rev);
        prov("outcome", outcomeId, "gross_recovery", raw("gross_recovery"), gross);
        prov("outcome", outcomeId, "attorney_fee", raw("attorney_fee"), fee);
      }

      const p = parsePercent(raw("pred_probability")), lo = parseMoney(raw("pred_low")), hi = parseMoney(raw("pred_high"));
      if (p != null && lo != null && hi != null && hi >= lo) {
        const predId = randomUUID();
        const when = parseDate(raw("pred_date")) ?? opened;
        if (when) {
          predVals.push({
            id: predId, organizationId: ctx.org.id, matterId, version: 1, recordedAt: new Date(`${when}T12:00:00Z`),
            authorAttorneyId: attorneyId, authorLabel: att.value ?? "Imported", recoveryLow: lo, recoveryHigh: hi, probability: p,
            expectedDurationMonths: parseNumber(raw("pred_duration")), expectedExpense: parseMoney(raw("pred_expense")), confidence: null,
            drivers: [], source: "historical", revisionReason: null,
          });
          prov("prediction", predId, "probability", raw("pred_probability"), p);
        }
      }
      if (humanReviewed) reviewedRows++; else autoRows++;
      created++;
      rowUpdates.push({ id: r.id, matterId, status: "imported" });
    }

    for (let i = 0; i < matterVals.length; i += 500) await tx.insert(matters).values(matterVals.slice(i, i + 500));
    for (let i = 0; i < outcomeVals.length; i += 500) await tx.insert(outcomes).values(outcomeVals.slice(i, i + 500));
    for (let i = 0; i < predVals.length; i += 500) await tx.insert(predictions).values(predVals.slice(i, i + 500));
    for (let i = 0; i < provVals.length; i += 1000) await tx.insert(provenance).values(provVals.slice(i, i + 1000));
    for (const u of rowUpdates) await tx.update(importRows).set({ matterId: u.matterId, status: u.status }).where(eq(importRows.id, u.id));

    const closedVals = matterVals.filter((m) => m.status === "closed");
    const closedIds = new Set(closedVals.map((m) => m.id));
    const share = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
    const preview = (imp.report ?? {}) as Record<string, unknown>;
    const report = {
      stage: "completed",
      rowsParsed: rows.length,
      created,
      skippedDuplicates: skipped,
      errorRows,
      possibleDuplicates: Number(preview.possibleDuplicates ?? 0),
      autoNormalizedRows: autoRows,
      reviewedRows,
      reviewedValues: reviews.filter((r) => r.reviewedBy).length,
      fieldsRecognized: Number(preview.fieldsRecognized ?? 0),
      missingFields: (preview.missingFields as string[]) ?? [],
      unparseable: preview.unparseable ?? {},
      coverage: {
        outcome: share(outcomeVals.length, closedVals.length),
        expenses: share(closedVals.filter((m) => m.expensesToDate != null).length, closedVals.length),
        fee: share(outcomeVals.filter((o) => o.attorneyFee != null).length, outcomeVals.filter((o) => o.favorable).length),
        referral: share(matterVals.filter((m) => m.referralSourceId).length, matterVals.length),
        historicalPredictions: share(predVals.filter((pv) => closedIds.has(pv.matterId)).length, closedVals.length),
      },
    };
    await tx.update(imports).set({ status: "completed", committedAt: new Date(), report }).where(eq(imports.id, importId));
    await audit(tx, { ...actor(ctx), action: "import.completed", summary: `Imported ${created} matters from ${imp.filename}`, objectType: "import", objectId: importId, metadata: { created, skipped, errorRows } });
    return { ok: true as const, report };
  });
}

/* ------------------------------------------------------------------ reads */
export async function listImports(ctx: OrgContext) {
  return withTenant(ctx.org.id, (tx) => tx.select().from(imports).where(eq(imports.organizationId, ctx.org.id)).orderBy(desc(imports.createdAt)).limit(100));
}

export async function getImportDetail(ctx: OrgContext, importId: string) {
  return withTenant(ctx.org.id, async (tx) => {
    const imp = (await tx.select().from(imports).where(and(eq(imports.id, importId), eq(imports.organizationId, ctx.org.id))).limit(1))[0];
    if (!imp) return null;
    const reviews = await tx.select().from(importValueReviews).where(eq(importValueReviews.importId, importId)).orderBy(asc(importValueReviews.field), desc(importValueReviews.occurrences));
    const sampleRows = await tx.select().from(importRows).where(eq(importRows.importId, importId)).orderBy(asc(importRows.rowNumber)).limit(8);
    const issueRows = await tx.select().from(importRows).where(and(eq(importRows.importId, importId), inArray(importRows.status, ["duplicate", "error", "skipped"]))).orderBy(asc(importRows.rowNumber)).limit(200);
    const cats = await categoryOptions(tx, ctx.org.id);
    const atts = (await tx.select({ name: attorneys.name }).from(attorneys).where(eq(attorneys.organizationId, ctx.org.id))).map((a) => a.name);
    const refs = (await tx.select({ name: referralSources.name }).from(referralSources).where(eq(referralSources.organizationId, ctx.org.id))).map((a) => a.name);
    return { imp, reviews, sampleRows, issueRows, categories: cats.map(({ key, label }) => ({ key, label })), attorneyNames: atts, referralNames: refs };
  });
}
