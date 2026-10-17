import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { pool, withTenant } from "@/server/db";
import { importValueReviews, imports, matters, provenance } from "@/server/db/schema";
import { acceptAllSuggestions, commitImport, createImport, getImportDetail, saveMappingAndBuildReview, type StoredMapping } from "@/server/imports/pipeline";
import { ImportFileError } from "@/server/imports/file";
import { loadPortfolio } from "@/server/services/portfolio";
import { getMatterDetail } from "@/server/services/ledger";
import { makeOrg, resetDb } from "./helpers";

const sample = readFileSync("public/samples/asteric-sample-import.csv");

beforeEach(resetDb);
afterAll(async () => { await pool().end(); globalThis.__astericPool = undefined; });

async function confirmSuggested(ctx: Awaited<ReturnType<typeof makeOrg>>, importId: string) {
  const d = await getImportDetail(ctx, importId);
  const cols = (d!.imp.mapping as StoredMapping).columns;
  return saveMappingAndBuildReview(ctx, importId, Object.fromEntries(cols.map((c) => [c.column, c.field])));
}

describe("import pipeline", () => {
  it("imports a messy CSV end to end with review, duplicates and provenance", async () => {
    const ctx = await makeOrg("Keller Test");
    const res = await createImport(ctx, { name: "export.csv", bytes: sample });
    expect("importId" in res).toBe(true);
    const importId = (res as { importId: string }).importId;

    const detail = await getImportDetail(ctx, importId);
    const mapped = Object.fromEntries((detail!.imp.mapping as StoredMapping).columns.map((c) => [c.column, c.field]));
    expect(mapped).toMatchObject({ "Matter #": "external_id", "Practice Type": "category", Atty: "lead_attorney", "Intake Probability": "pred_probability", "Value Low": "pred_low" });
    expect(mapped["Internal Code"]).toBeNull();

    expect(await confirmSuggested(ctx, importId)).toEqual({ ok: true });
    const after = await getImportDetail(ctx, importId);
    const preview = after!.imp.report as Record<string, number>;
    expect(preview.rowsParsed).toBe(64);
    expect(preview.possibleDuplicates).toBe(2);
    expect(preview.errorRows).toBe(1);
    // Attorney name variants are merged but routed to a human.
    const pending = after!.reviews.filter((r) => r.decision === "pending");
    expect(pending.some((r) => r.field === "lead_attorney" && r.originalValue === "J. Ross" && r.suggestedValue === "Jane Ross")).toBe(true);
    expect(after!.reviews.find((r) => r.field === "category" && r.originalValue === "FEHA retaliation")).toMatchObject({ suggestedValue: "retaliation", decision: "accepted" });

    // Commit is blocked until every value is reviewed.
    expect(await commitImport(ctx, importId, { skipDuplicates: true })).toMatchObject({ error: expect.stringMatching(/need review/) });
    await acceptAllSuggestions(ctx, importId);
    const done = await commitImport(ctx, importId, { skipDuplicates: true });
    expect(done).toMatchObject({ ok: true });
    const report = (done as { report: Record<string, unknown> }).report as { created: number; skippedDuplicates: number; errorRows: number; reviewedRows: number; autoNormalizedRows: number; coverage: Record<string, number | null> };
    expect(report.created).toBe(61);
    expect(report.skippedDuplicates).toBe(2);
    expect(report.errorRows).toBe(1);
    expect(report.created).toBe(report.reviewedRows + report.autoNormalizedRows);
    expect(report.coverage.outcome).toBeGreaterThan(80);

    // Persisted data reconciles with the report.
    const p = await loadPortfolio(ctx.org.id);
    expect(p.facts).toHaveLength(61);
    expect(new Set(p.attorneys.map((a) => a.name)).has("Jane Ross")).toBe(true);
    expect(p.attorneys.map((a) => a.name).filter((n) => /ross/i.test(n))).toEqual(["Jane Ross"]);
    expect(p.facts.some((f) => f.predictions.some((x) => x.source === "historical"))).toBe(true);
    const prov = await withTenant(ctx.org.id, (tx) => tx.select().from(provenance).where(and(eq(provenance.organizationId, ctx.org.id), eq(provenance.field, "category"))));
    const feha = prov.find((x) => x.originalValue === "FEHA retaliation");
    expect(feha).toMatchObject({ normalizedValue: "retaliation", source: "import", importId });
    const reviewedProv = prov.find((x) => x.reviewedBy);
    expect(reviewedProv?.reviewedAt).toBeTruthy();

    // Matter detail resolves its related records and lineage.
    const withAll = p.facts.find((f) => f.attorneyId && f.categoryKey && f.referralId)!;
    const det = await getMatterDetail(ctx, withAll.id);
    expect(det!.category?.key).toBe(withAll.categoryKey);
    expect(det!.attorney?.id).toBe(withAll.attorneyId);
    expect(det!.referral?.id).toBe(withAll.referralId);
    expect(det!.importInfo?.id).toBe(importId);
    expect(det!.provenance.length).toBeGreaterThan(0);
  });

  it("detects a re-upload of an already imported file", async () => {
    const ctx = await makeOrg("Dup Test");
    const { importId } = (await createImport(ctx, { name: "export.csv", bytes: sample })) as { importId: string };
    await confirmSuggested(ctx, importId);
    await acceptAllSuggestions(ctx, importId);
    await commitImport(ctx, importId, { skipDuplicates: true });
    const again = await createImport(ctx, { name: "export-copy.csv", bytes: sample });
    expect("duplicateOf" in again).toBe(true);
  });

  it("rejects unsupported, corrupt and oversized files", async () => {
    const ctx = await makeOrg("Reject Test");
    await expect(createImport(ctx, { name: "matters.pdf", bytes: Buffer.from("%PDF-1.4") })).rejects.toBeInstanceOf(ImportFileError);
    await expect(createImport(ctx, { name: "matters.xlsx", bytes: Buffer.from("not a zip") })).rejects.toThrow(/valid .xlsx/);
    await expect(createImport(ctx, { name: "binary.csv", bytes: Buffer.from([0x61, 0x00, 0x62]) })).rejects.toThrow(/binary/);
    await expect(createImport(ctx, { name: "big.csv", bytes: Buffer.alloc(4 * 1024 * 1024 + 1, 0x61) })).rejects.toThrow(/4 MB/);
    await expect(createImport(ctx, { name: "empty.csv", bytes: Buffer.from("Name,Status\n") })).rejects.toThrow(/no data rows/);
  });

  it("requires a name or matter ID mapping and one column per field", async () => {
    const ctx = await makeOrg("Mapping Test");
    const { importId } = (await createImport(ctx, { name: "x.csv", bytes: Buffer.from("Case Name,Atty\nA v. B,Jane Ross\n") })) as { importId: string };
    expect(await saveMappingAndBuildReview(ctx, importId, { "Case Name": null, Atty: "lead_attorney" })).toMatchObject({ error: expect.stringMatching(/matter name or a matter ID/) });
    expect(await saveMappingAndBuildReview(ctx, importId, { "Case Name": "name", Atty: "name" })).toMatchObject({ error: expect.stringMatching(/more than one column/) });
    const status = await withTenant(ctx.org.id, (tx) => tx.select({ s: imports.status }).from(imports).where(eq(imports.id, importId)));
    expect(status[0]!.s).toBe("uploaded");
  });

  it("keeps each tenant's imports separate", async () => {
    const a = await makeOrg("A");
    const b = await makeOrg("B");
    const { importId } = (await createImport(a, { name: "a.csv", bytes: sample })) as { importId: string };
    expect(await getImportDetail(b, importId)).toBeNull();
    const reviewsSeenByB = await withTenant(b.org.id, (tx) => tx.select().from(importValueReviews));
    expect(reviewsSeenByB).toHaveLength(0);
    const mattersSeenByB = await withTenant(b.org.id, (tx) => tx.select().from(matters));
    expect(mattersSeenByB).toHaveLength(0);
  });
});
