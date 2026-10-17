import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { count, eq } from "drizzle-orm";
import { pool, systemDb, withTenant } from "@/server/db";
import { auditEvents, matters, organizations, predictions, users } from "@/server/db/schema";
import { createMatter, recordPrediction } from "@/server/services/ledger";
import { purgeDeletedOrganizations } from "@/server/maintenance";
import { resetDemoSandbox, seedDemo } from "@/server/demo/seed";
import { loadPortfolio } from "@/server/services/portfolio";
import { generateInsights } from "@/lib/analytics/insights";
import { AuthError } from "@/server/auth/session";
import { ctxFor, makeOrg, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => { await pool().end(); globalThis.__astericPool = undefined; });

const n = async (t: typeof matters | typeof predictions | typeof auditEvents, orgId: string) =>
  Number((await systemDb().select({ n: count() }).from(t).where(eq(t.organizationId, orgId)))[0]!.n);

describe("organization deletion", () => {
  it("purges only organizations past the grace period, including append-only rows", async () => {
    const a = await makeOrg("Deleting Firm");
    const b = await makeOrg("Keeping Firm");
    for (const ctx of [a, b]) {
      const m = await createMatter(ctx, { name: "Matter", openedOn: "2025-02-01" });
      await recordPrediction(ctx, m.id, { recoveryLow: 1, recoveryHigh: 2, probability: 0.5, expectedDurationMonths: 12, expectedExpense: 10, confidence: "low", drivers: [] });
    }
    await systemDb().update(organizations).set({ deletionRequestedAt: new Date(Date.now() - 31 * 86400_000) }).where(eq(organizations.id, a.org.id));
    await systemDb().update(organizations).set({ deletionRequestedAt: new Date(Date.now() - 5 * 86400_000) }).where(eq(organizations.id, b.org.id));
    expect(await purgeDeletedOrganizations()).toEqual({ purged: 1 });
    expect(await systemDb().select().from(organizations).where(eq(organizations.id, a.org.id))).toHaveLength(0);
    expect(await n(predictions, a.org.id)).toBe(0);
    expect(await n(auditEvents, a.org.id)).toBe(0);
    expect(await n(predictions, b.org.id)).toBe(1);
  });
});

describe("manual matters", () => {
  it("creates an open matter with an opening event, and is blocked for read-only roles and the demo org", async () => {
    const a = await makeOrg("Intake Firm");
    const m = await createMatter(a, { name: "Rivera v. Halcyon", externalId: "R-1", openedOn: "2026-01-05", categoryKey: "retaliation" });
    expect(m.status).toBe("open");
    await expect(createMatter(a, { name: "Dup", externalId: "R-1", openedOn: "2026-01-05" })).rejects.toThrow(/already exists/);
    const viewer = ctxFor(a.org.id, a.org.name, a.user.id, a.user.name, "viewer", null);
    await expect(createMatter(viewer, { name: "X", openedOn: "2026-01-05" })).rejects.toBeInstanceOf(AuthError);
    const demo = await makeOrg("Demo", "owner", { isDemo: true });
    await expect(createMatter(demo, { name: "X", openedOn: "2026-01-05" })).rejects.toBeInstanceOf(AuthError);
  });
});

describe("demonstration workspace", () => {
  it("seeds the synthetic firm without touching other organizations, and is repeatable", async () => {
    const real = await makeOrg("Real Firm");
    await createMatter(real, { name: "Real matter", openedOn: "2025-02-01" });
    const r1 = await seedDemo({ asOf: "2026-10-17" });
    const r2 = await seedDemo({ asOf: "2026-10-18" });
    expect(r2.orgId).toBe(r1.orgId);
    expect(r1.matters).toBeGreaterThanOrEqual(500);
    expect(await n(matters, r1.orgId)).toBe(r2.matters);
    expect(await n(matters, real.org.id)).toBe(1);
    const demoUser = (await systemDb().select().from(users).where(eq(users.isDemoUser, true)))[0]!;
    expect(demoUser.passwordHash).toBeNull();

    // Analytics computed from the database reproduce the walkthrough findings.
    const ctx = ctxFor(r1.orgId, "Keller & Ross Employment Law", demoUser.id, demoUser.name, "demo", null, true);
    const p = await loadPortfolio(r1.orgId);
    const kinds = new Set(generateInsights(p.facts, { attorneyHourlyCost: 175, defaultContingencyRate: 0.4, expensesReimbursedFromRecovery: true }, { asOf: "2026-10-18", staleDays: 180, expenseThreshold: 0.25 }).map((i) => i.kind));
    expect(kinds).toContain("Valuation");
    expect(kinds).toContain("Referral economics");

    // Sandbox predictions by visitors are removed by the reset; real predictions are untouched.
    const open = (await withTenant(r1.orgId, (tx) => tx.select().from(matters).where(eq(matters.status, "open")).limit(1)))[0]!;
    const before = await n(predictions, r1.orgId);
    const sb = await recordPrediction(ctx, open.id, { recoveryLow: 1, recoveryHigh: 2, probability: 0.5, expectedDurationMonths: 12, expectedExpense: 10, confidence: "low", drivers: [], revisionReason: "test" });
    expect(sb.source).toBe("sandbox");
    expect(await resetDemoSandbox()).toEqual({ deleted: 1 });
    expect(await n(predictions, r1.orgId)).toBe(before);
  });
});
