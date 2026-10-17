import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { systemDb } from "@/server/db";
import {
  attorneys, auditEvents, categories, imports, importValueReviews, matters, memberships, offers, organizations, outcomes,
  predictions, proceduralEvents, provenance, referralSources, savedViews, users,
} from "@/server/db/schema";
import { DEFAULT_CATEGORIES } from "@/lib/taxonomy";
import { DEFAULT_ORG_SETTINGS } from "@/server/org-settings";
import { ATTORNEYS, generateDemo, SOURCES, type DemoMatter } from "./generate";

export const DEMO_ORG_NAME = "Keller & Ross Employment Law";
/** Never a deliverable mailbox: the demo user cannot sign in with a password or receive email. */
export const DEMO_USER_EMAIL = "demo-visitor@asteric.invalid";

const at = (d: string, hour = 17) => new Date(`${d}T${String(hour).padStart(2, "0")}:00:00.000Z`);
const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Creates or fully refreshes the synthetic demonstration organization.
 * The organization row, its categories and the demo user are kept (so sessions and
 * memberships survive); everything else is deleted and regenerated relative to `asOf`.
 * Touches only the organization flagged `is_demo`; never reads or writes customer data.
 */
export async function seedDemo(opts: { asOf?: string } = {}) {
  const asOf = opts.asOf ?? new Date().toISOString().slice(0, 10);
  const { matters: demo } = generateDemo({ asOf });
  const db = systemDb();

  return db.transaction(async (tx) => {
    // Permit deletes on append-only tables for this transaction only.
    await tx.execute(sql`select set_config('app.allow_purge', 'on', true)`);

    let org = (await tx.select().from(organizations).where(eq(organizations.isDemo, true)).limit(1))[0];
    const settings = { ...DEFAULT_ORG_SETTINGS, attorneyHourlyCost: 175, defaultContingencyRate: 0.4, analystsSeePredictionAuthors: true };
    if (!org) {
      org = (await tx.insert(organizations).values({
        name: DEMO_ORG_NAME, isDemo: true, practiceArea: "employment", attorneyCount: "6–10", matterVolume: "500–1,000",
        caseManagementSystem: "filevine", settings, onboardingCompletedAt: new Date(),
      }).returning())[0]!;
      await tx.insert(categories).values(DEFAULT_CATEGORIES.employment.map((c, i) => ({ organizationId: org!.id, key: c.key, label: c.label, practiceArea: "employment", sort: i })));
    } else {
      await tx.update(organizations).set({ name: DEMO_ORG_NAME, settings, onboardingCompletedAt: org.onboardingCompletedAt ?? new Date() }).where(eq(organizations.id, org.id));
    }
    const orgId = org.id;

    // Wipe generated data (cascades to predictions, events, offers, outcomes).
    for (const t of [matters, attorneys, referralSources, imports, provenance, auditEvents, savedViews]) {
      await tx.delete(t).where(eq(t.organizationId, orgId));
    }

    // Demo visitor: role "demo" (read everything, sandbox predictions, nothing persists to real data).
    let demoUser = (await tx.select().from(users).where(eq(users.isDemoUser, true)).limit(1))[0];
    if (!demoUser) {
      demoUser = (await tx.insert(users).values({ email: DEMO_USER_EMAIL, name: "Demo visitor", isDemoUser: true, emailVerifiedAt: new Date() }).returning())[0]!;
    }
    const hasMembership = (await tx.select().from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, demoUser.id))).limit(1))[0];
    if (!hasMembership) await tx.insert(memberships).values({ organizationId: orgId, userId: demoUser.id, role: "demo" });

    // Reference data
    const cats = new Map((await tx.select().from(categories).where(eq(categories.organizationId, orgId))).map((c) => [c.key, c.id]));
    const attRows = await tx.insert(attorneys).values(ATTORNEYS.map((a) => ({ organizationId: orgId, name: a.name, title: a.title }))).returning();
    const attId = new Map(ATTORNEYS.map((a) => [a.key, attRows.find((r) => r.name === a.name)!.id]));
    const attName = new Map(ATTORNEYS.map((a) => [a.key, a.name]));
    const refRows = await tx.insert(referralSources).values(SOURCES.map((s) => ({ organizationId: orgId, name: s.name }))).returning();
    const refId = new Map(SOURCES.map((s) => [s.key, refRows.find((r) => r.name === s.name)!.id]));

    // A completed historical import that brought in the pre-2023 matters.
    const historical = demo.filter((m) => m.imported);
    const importId = randomUUID();
    const importedOn = new Date(Date.parse(`${asOf}T00:00:00Z`) - 120 * 86400_000);
    const rawCats = new Map<string, { key: string; n: number }>();
    for (const m of historical) {
      const r = rawCats.get(m.originalCategory) ?? { key: m.category, n: 0 };
      r.n++;
      rawCats.set(m.originalCategory, r);
    }
    const closedHist = historical.filter((m) => m.outcome);
    const share = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);
    await tx.insert(imports).values({
      id: importId, organizationId: orgId, filename: "filevine-closed-and-open-matters-2019-2022.csv", fileSize: 412_331, mime: "text/csv",
      sha256: "demo-seed-not-a-real-file", status: "completed", sourceSystem: "filevine", rowCount: historical.length + 9,
      columnHeaders: ["Project ID", "Project Name", "Case Type", "Primary Attorney", "Referral Source", "Date Opened", "Phase", "Date Closed", "Disposition", "Gross Settlement", "Case Costs", "Atty Fee", "Referral Fee", "Intake Odds"],
      mapping: { columns: {} },
      report: {
        stage: "completed", rowsParsed: historical.length + 9, created: historical.length, skippedDuplicates: 6, errorRows: 3, possibleDuplicates: 6,
        autoNormalizedRows: historical.length - 41, reviewedRows: 41, reviewedValues: [...rawCats.values()].length, fieldsRecognized: 14, missingFields: ["attorney_hours"], unparseable: {},
        coverage: {
          outcome: share(closedHist.length, historical.filter((m) => m.status === "closed").length), expenses: 100, fee: 100, referral: share(historical.filter((m) => m.source).length, historical.length),
          historicalPredictions: share(closedHist.filter((m) => m.predictions.length).length, closedHist.length),
        },
        synthetic: true,
      },
      createdBy: null, createdAt: importedOn, committedAt: importedOn,
    });
    await tx.insert(importValueReviews).values([...rawCats.entries()].map(([raw, r], i) => {
      const lower = raw.toLowerCase();
      const conf = lower.replace(/[^a-z]/g, "") === r.key.replace(/_/g, "") ? 0.98 : i % 3 === 0 ? 0.72 : 0.9;
      return {
        organizationId: orgId, importId, field: "category", originalValue: raw, suggestedValue: r.key, confidence: conf, method: conf >= 0.95 ? "exact" : "synonym",
        decision: conf < 0.85 ? "accepted" as const : "accepted" as const, finalValue: r.key, occurrences: r.n, reviewedBy: conf < 0.85 ? demoUser!.id : null, reviewedAt: conf < 0.85 ? importedOn : null,
      };
    }));

    // Matters and their ledgers
    type Row<T> = T extends { $inferInsert: infer I } ? I : never;
    const mVals: Row<typeof matters>[] = [], pVals: Row<typeof predictions>[] = [], eVals: Row<typeof proceduralEvents>[] = [];
    const oVals: Row<typeof offers>[] = [], outVals: Row<typeof outcomes>[] = [], provVals: Row<typeof provenance>[] = [], audVals: Row<typeof auditEvents>[] = [];
    const ids = new Map<string, string>();
    for (const m of demo) {
      const id = randomUUID();
      ids.set(m.externalId, id);
      mVals.push(matterRow(m, id, orgId, cats, attId, refId, m.imported ? importId : null));
      let prev: string | null = null;
      for (const p of m.predictions) {
        const pid = randomUUID();
        pVals.push({
          id: pid, organizationId: orgId, matterId: id, version: p.version, recordedAt: at(p.recordedOn), authorAttorneyId: attId.get(m.attorney)!, authorLabel: attName.get(m.attorney)!,
          recoveryLow: p.low, recoveryHigh: p.high, probability: p.probability, expectedDurationMonths: p.durationMonths, expectedExpense: p.expense, confidence: p.confidence,
          drivers: p.drivers, proceduralStage: p.stage, revisionReason: p.reason, source: p.source, supersedesId: prev, createdAt: at(p.recordedOn),
        });
        if (p.source === "prospective") {
          audVals.push({ organizationId: orgId, actorLabel: attName.get(m.attorney)!, action: p.version === 1 ? "prediction.recorded" : "prediction.revised", objectType: "matter", objectId: id,
            summary: `${p.version === 1 ? "Recorded" : "Revised"} prediction v${p.version} for ${m.name}`, metadata: { synthetic: true }, createdAt: at(p.recordedOn) });
        }
        prev = pid;
      }
      for (const e of m.events) eVals.push({ organizationId: orgId, matterId: id, type: e.type as never, occurredOn: e.on, title: e.title, amount: e.amount ?? null, createdAt: at(e.on, 16) });
      for (const o of m.offers) oVals.push({ organizationId: orgId, matterId: id, direction: o.direction, amount: o.amount, offeredOn: o.on, createdAt: at(o.on, 16) });
      if (m.outcome) {
        const o = m.outcome;
        outVals.push({ organizationId: orgId, matterId: id, resolutionType: o.resolutionType as never, favorable: o.favorable, resolvedOn: o.resolvedOn, grossRecovery: o.gross, attorneyFee: o.fee,
          referralFeePaid: o.referralFee, litigationExpenses: o.expenses, netToClient: o.netToClient, attorneyHours: o.hours, recordedAt: m.imported ? importedOn : at(o.resolvedOn, 18), updatedAt: m.imported ? importedOn : at(o.resolvedOn, 18) });
        if (!m.imported) audVals.push({ organizationId: orgId, actorLabel: attName.get(m.attorney)!, action: "outcome.recorded", objectType: "matter", objectId: id, summary: `Recorded outcome for ${m.name}`, metadata: { synthetic: true }, createdAt: at(o.resolvedOn, 18) });
      }
      if (m.imported) {
        const rev = rawCats.get(m.originalCategory);
        provVals.push({ organizationId: orgId, entityType: "matter", entityId: id, field: "category", originalValue: m.originalCategory, normalizedValue: m.category, source: "import", importId, confidence: rev ? 0.9 : null, method: "synonym", createdAt: importedOn });
        provVals.push({ organizationId: orgId, entityType: "matter", entityId: id, field: "opened_on", originalValue: m.openedOn, normalizedValue: m.openedOn, source: "import", importId, confidence: 1, method: "parsed", createdAt: importedOn });
      } else {
        provVals.push({ organizationId: orgId, entityType: "matter", entityId: id, field: "matter", originalValue: null, normalizedValue: m.externalId, source: "demo_seed", method: "synthetic", createdAt: at(m.openedOn) });
      }
    }
    audVals.push({ organizationId: orgId, actorLabel: "Ana Keller", action: "import.completed", objectType: "import", objectId: importId, summary: `Imported ${historical.length} matters from filevine-closed-and-open-matters-2019-2022.csv`, metadata: { synthetic: true }, createdAt: importedOn });

    for (const c of chunks(mVals, 400)) await tx.insert(matters).values(c);
    for (const c of chunks(pVals, 500)) await tx.insert(predictions).values(c);
    for (const c of chunks(eVals, 800)) await tx.insert(proceduralEvents).values(c);
    for (const c of chunks(oVals, 800)) await tx.insert(offers).values(c);
    for (const c of chunks(outVals, 500)) await tx.insert(outcomes).values(c);
    for (const c of chunks(provVals, 1000)) await tx.insert(provenance).values(c);
    for (const c of chunks(audVals, 1000)) await tx.insert(auditEvents).values(c);

    return { orgId, demoUserId: demoUser.id, matters: mVals.length, predictions: pVals.length, events: eVals.length, outcomes: outVals.length, asOf };
  });
}

function matterRow(m: DemoMatter, id: string, orgId: string, cats: Map<string, string>, attId: Map<string, string>, refId: Map<string, string>, importId: string | null) {
  return {
    id, organizationId: orgId, externalId: m.externalId, name: m.name, status: m.status, categoryId: cats.get(m.category) ?? null, originalCategory: m.originalCategory,
    jurisdiction: m.jurisdiction, court: m.court, leadAttorneyId: attId.get(m.attorney) ?? null, referralSourceId: m.source ? refId.get(m.source) ?? null : null,
    openedOn: m.openedOn, closedOn: m.outcome?.resolvedOn ?? null, proceduralStage: m.stage, defendantIndustry: m.industry, defendantSize: m.size,
    attorneyHours: m.hours, expensesToDate: m.expensesToDate, importId, createdAt: at(m.openedOn, 15), updatedAt: at(m.outcome?.resolvedOn ?? m.openedOn, 15),
  };
}

/** Removes sandbox predictions recorded by demo visitors. Called by the daily reset. */
export async function resetDemoSandbox() {
  return systemDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.allow_purge', 'on', true)`);
    const org = (await tx.select().from(organizations).where(eq(organizations.isDemo, true)).limit(1))[0];
    if (!org) return { deleted: 0 };
    const res = await tx.delete(predictions).where(and(eq(predictions.organizationId, org.id), eq(predictions.source, "sandbox"))).returning({ id: predictions.id });
    return { deleted: res.length };
  });
}
