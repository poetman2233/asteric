import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { pool, systemDb, withTenant } from "@/server/db";
import { matters, predictions } from "@/server/db/schema";
import { getMatterDetail, recordPrediction } from "@/server/services/ledger";
import { loadPortfolio } from "@/server/services/portfolio";
import { AuthError } from "@/server/auth/session";
import { ctxFor, makeOrg, resetDb } from "./helpers";

const basePrediction = { recoveryLow: 300_000, recoveryHigh: 450_000, probability: 0.65, expectedDurationMonths: 14, expectedExpense: 45_000, confidence: "medium" as const, drivers: ["clear_liability", "strong_documentary_evidence"] };

async function addMatter(orgId: string, name: string, status: "open" | "closed" = "open") {
  return withTenant(orgId, async (tx) => (await tx.insert(matters).values({ organizationId: orgId, name, status, openedOn: "2025-01-15" }).returning())[0]!);
}

/** Resolves to the underlying Postgres error message (Drizzle wraps it in `cause`). */
async function pgReason(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { const err = e as Error & { cause?: Error }; return `${err.message} ${err.cause?.message ?? ""}`; }
  return "did not fail";
}

beforeEach(resetDb);
afterAll(async () => { await pool().end(); globalThis.__astericPool = undefined; });

describe("tenant isolation", () => {
  it("organization B cannot read organization A's matters through services", async () => {
    const a = await makeOrg("Firm A");
    const b = await makeOrg("Firm B");
    const m = await addMatter(a.org.id, "Confidential A matter");
    expect(await getMatterDetail(a, m.id)).not.toBeNull();
    expect(await getMatterDetail(b, m.id)).toBeNull();
    const pb = await loadPortfolio(b.org.id);
    expect(pb.facts.find((f) => f.id === m.id)).toBeUndefined();
  });

  it("row-level security hides other tenants even when a query forgets its filter", async () => {
    const a = await makeOrg("Firm A");
    const b = await makeOrg("Firm B");
    await addMatter(a.org.id, "A1");
    await addMatter(b.org.id, "B1");
    const visibleToB = await withTenant(b.org.id, (tx) => tx.select({ name: matters.name }).from(matters)); // no WHERE clause
    expect(visibleToB.map((r) => r.name)).toEqual(["B1"]);
  });

  it("row-level security rejects writing rows into another tenant", async () => {
    const a = await makeOrg("Firm A");
    const b = await makeOrg("Firm B");
    expect(await pgReason(withTenant(b.org.id, (tx) => tx.insert(matters).values({ organizationId: a.org.id, name: "smuggled" })))).toMatch(/row-level security/i);
  });

  it("rejects a malformed organization id before touching the database", async () => {
    await expect(withTenant("not-a-uuid", async () => 1)).rejects.toThrow(/invalid organization id/);
  });
});

describe("immutable predictions", () => {
  it("creates a prediction, and a revision creates a new row while the original stays unchanged", async () => {
    const a = await makeOrg("Firm A");
    const m = await addMatter(a.org.id, "Okonkwo v. Meridian");
    const v1 = await recordPrediction(a, m.id, basePrediction);
    expect(v1.version).toBe(1);
    await expect(recordPrediction(a, m.id, { ...basePrediction, probability: 0.78 })).rejects.toThrow(/what new information/i);
    const v2 = await recordPrediction(a, m.id, { ...basePrediction, recoveryLow: 400_000, recoveryHigh: 550_000, probability: 0.78, expectedDurationMonths: 17, revisionReason: "Discovery completed" });
    expect(v2.version).toBe(2);
    expect(v2.supersedesId).toBe(v1.id);
    const rows = await withTenant(a.org.id, (tx) => tx.select().from(predictions).where(eq(predictions.matterId, m.id)).orderBy(predictions.version));
    expect(rows).toHaveLength(2);
    expect(rows[0]!.probability).toBe(0.65);
    expect(rows[0]!.recoveryLow).toBe(300_000);
    expect(rows[1]!.probability).toBe(0.78);
  });

  it("the application role cannot update or delete a prediction", async () => {
    const a = await makeOrg("Firm A");
    const m = await addMatter(a.org.id, "M");
    await recordPrediction(a, m.id, basePrediction);
    expect(await pgReason(withTenant(a.org.id, (tx) => tx.update(predictions).set({ probability: 0.99 })))).toMatch(/permission denied/i);
    expect(await pgReason(withTenant(a.org.id, (tx) => tx.delete(predictions)))).toMatch(/permission denied/i);
  });

  it("a database trigger blocks rewriting history even for the table owner", async () => {
    const a = await makeOrg("Firm A");
    const m = await addMatter(a.org.id, "M");
    await recordPrediction(a, m.id, basePrediction);
    expect(await pgReason(systemDb().update(predictions).set({ probability: 0.01 }))).toMatch(/append-only/i);
    expect(await pgReason(systemDb().execute(sql`delete from audit_events`))).toMatch(/append-only/i);
  });

  it("refuses predictions on closed matters", async () => {
    const a = await makeOrg("Firm A");
    const m = await addMatter(a.org.id, "Closed", "closed");
    await expect(recordPrediction(a, m.id, basePrediction)).rejects.toThrow(/closed/i);
  });
});

describe("role restrictions", () => {
  it("viewers and analysts cannot record predictions; attorneys can", async () => {
    const a = await makeOrg("Firm A");
    const m = await addMatter(a.org.id, "M");
    const viewer = ctxFor(a.org.id, a.org.name, a.user.id, "Viewer", "viewer", null);
    const analyst = ctxFor(a.org.id, a.org.name, a.user.id, "Analyst", "analyst", null);
    const attorney = ctxFor(a.org.id, a.org.name, a.user.id, "Attorney", "attorney", a.attorneyId);
    await expect(recordPrediction(viewer, m.id, basePrediction)).rejects.toBeInstanceOf(AuthError);
    await expect(recordPrediction(analyst, m.id, basePrediction)).rejects.toBeInstanceOf(AuthError);
    await expect(recordPrediction(attorney, m.id, basePrediction)).resolves.toMatchObject({ version: 1, source: "prospective" });
  });

  it("demo viewers record only sandbox predictions, and only in the demo organization", async () => {
    const demo = await makeOrg("Demo Org", "demo", { isDemo: true });
    const m = await addMatter(demo.org.id, "Demo matter");
    await expect(recordPrediction(demo, m.id, basePrediction)).resolves.toMatchObject({ source: "sandbox" });
    const real = await makeOrg("Real Firm");
    const m2 = await addMatter(real.org.id, "Real matter");
    const demoInReal = ctxFor(real.org.id, real.org.name, demo.user.id, "Demo", "demo", null, false);
    await expect(recordPrediction(demoInReal, m2.id, basePrediction)).rejects.toBeInstanceOf(AuthError);
  });
});
