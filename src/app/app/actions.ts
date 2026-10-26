"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { run, type ActionResult } from "@/server/action-runner";
import { systemDb, withTenant } from "@/server/db";
import { memberships, notificationReads, organizations, sessions } from "@/server/db/schema";
import { AuthError, getOrgContext, listMemberships, requireUser } from "@/server/auth/session";
import { addEvent, addOffer, createMatter, newMatterSchema, eventSchema, financialSchema, offerSchema, outcomeSchema, predictionSchema, recordOutcome, recordPrediction, updateFinancials } from "@/server/services/ledger";
import { acceptAllSuggestions, cancelImport, commitImport, createImport, decideReview, saveMappingAndBuildReview } from "@/server/imports/pipeline";
import { createOrganization, ensureAttorneyForMember } from "@/server/services/accounts";
import { loadPortfolio } from "@/server/services/portfolio";
import { audit } from "@/server/audit";
import { logger } from "@/server/logger";
import { PRACTICE_AREAS, type PracticeArea } from "@/lib/taxonomy";

export type { ActionResult } from "@/server/action-runner";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/* ------------------------------------------------------------------ organization switching */
export async function switchOrgAction(orgId: string) {
  const s = await requireUser();
  const m = (await listMemberships(s.userId)).find((x) => x.orgId === orgId);
  if (!m) return;
  await systemDb().update(sessions).set({ activeOrganizationId: orgId }).where(eq(sessions.id, s.id));
  redirect("/app");
}

/* ------------------------------------------------------------------ decision ledger */
export async function recordPredictionAction(matterId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("record_prediction", async () => {
    const ctx = await getOrgContext();
    const input = predictionSchema.parse({
      recoveryLow: num(fd.get("recoveryLow")), recoveryHigh: num(fd.get("recoveryHigh")),
      probability: (num(fd.get("probability")) ?? NaN) / 100,
      expectedDurationMonths: num(fd.get("expectedDurationMonths")), expectedExpense: num(fd.get("expectedExpense")),
      confidence: String(fd.get("confidence") ?? ""), drivers: fd.getAll("drivers").map(String).filter(Boolean),
      revisionReason: String(fd.get("revisionReason") ?? "") || undefined,
    });
    const p = await recordPrediction(ctx, matterId, input);
    revalidatePath(`/app/matters/${matterId}`);
    return { ok: p.version > 1 ? `Assessment v${p.version} recorded. Earlier versions are preserved.` : "Assessment recorded and locked.", id: p.id };
  });
}

export async function addEventAction(matterId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("add_event", async () => {
    const ctx = await getOrgContext();
    const amount = num(fd.get("amount"));
    const ev = await addEvent(ctx, matterId, eventSchema.parse({ type: fd.get("type"), occurredOn: fd.get("occurredOn"), title: fd.get("title"), description: String(fd.get("description") ?? "") || undefined, amount: amount ?? undefined }));
    revalidatePath(`/app/matters/${matterId}`);
    revalidatePath("/app", "layout");
    return { ok: "Event added to the ledger.", data: { momentId: ev.momentId } };
  });
}

export async function addOfferAction(matterId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("add_offer", async () => {
    const ctx = await getOrgContext();
    const o = await addOffer(ctx, matterId, offerSchema.parse({ direction: fd.get("direction"), amount: num(fd.get("amount")), offeredOn: fd.get("offeredOn"), notes: String(fd.get("notes") ?? "") || undefined }));
    revalidatePath(`/app/matters/${matterId}`);
    revalidatePath("/app", "layout");
    return { ok: "Offer recorded.", data: { momentId: o.momentId } };
  });
}

export async function updateFinancialsAction(matterId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("update_financials", async () => {
    const ctx = await getOrgContext();
    const r = await updateFinancials(ctx, matterId, financialSchema.parse({ expensesToDate: num(fd.get("expensesToDate")), attorneyHours: num(fd.get("attorneyHours")) }));
    revalidatePath(`/app/matters/${matterId}`);
    revalidatePath("/app", "layout");
    return { ok: "Financials updated.", data: { momentId: r.momentId } };
  });
}

export async function recordOutcomeAction(matterId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("record_outcome", async () => {
    const ctx = await getOrgContext();
    await recordOutcome(ctx, matterId, outcomeSchema.parse({
      resolutionType: fd.get("resolutionType"), resolvedOn: fd.get("resolvedOn"),
      grossRecovery: num(fd.get("grossRecovery")), attorneyFee: num(fd.get("attorneyFee")), referralFeePaid: num(fd.get("referralFeePaid")),
      litigationExpenses: num(fd.get("litigationExpenses")), netToClient: num(fd.get("netToClient")), attorneyHours: num(fd.get("attorneyHours")),
      notes: String(fd.get("notes") ?? "") || undefined,
    }));
    revalidatePath(`/app/matters/${matterId}`);
    return { ok: "Outcome recorded. The matter is now closed." };
  });
}

export async function createMatterAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id: string | undefined;
  const res = await run("create_matter", async () => {
    const ctx = await getOrgContext();
    const opt = (k: string) => String(fd.get(k) ?? "").trim() || undefined;
    const m = await createMatter(ctx, newMatterSchema.parse({
      name: opt("name") ?? "", externalId: opt("externalId"), categoryKey: opt("categoryKey"), leadAttorneyId: opt("leadAttorneyId"),
      referralName: opt("referralName"), jurisdiction: opt("jurisdiction"), court: opt("court"), openedOn: opt("openedOn") ?? "", proceduralStage: opt("proceduralStage"),
    }));
    id = m.id;
  });
  if (id) { revalidatePath("/app", "layout"); redirect(`/app/matters/${id}?new=1`); }
  return res;
}

/* ------------------------------------------------------------------ imports */
export async function uploadImportAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let importId: string | undefined;
  const res = await run("upload_import", async () => {
    const ctx = await getOrgContext();
    if (!ctx.can("imports.manage") && !ctx.can("imports.preview")) throw new AuthError("forbidden", "Your role does not permit importing data.");
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return { error: "Choose a CSV or XLSX file to upload." };
    const out = await createImport(ctx, { name: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, { force: fd.get("force") === "1" });
    if ("duplicateOf" in out && out.duplicateOf) return { error: `This exact file was already imported on ${out.duplicateOf.createdAt.toISOString().slice(0, 10)} (${out.duplicateOf.filename}). Upload it again with "Import anyway" if that is intended.`, id: "duplicate" };
    if ("importId" in out) importId = out.importId;
  });
  if (importId) redirect(`/app/imports/${importId}`);
  return res;
}

export async function saveMappingAction(importId: string, assignments: Record<string, string | null>): Promise<ActionResult> {
  return run("save_mapping", async () => {
    const ctx = await getOrgContext();
    if (!ctx.can("imports.manage") && !ctx.can("imports.preview")) throw new AuthError("forbidden");
    const r = await saveMappingAndBuildReview(ctx, importId, assignments);
    revalidatePath(`/app/imports/${importId}`);
    return "error" in r ? { error: r.error } : { ok: "Mapping confirmed." };
  });
}

export async function decideReviewAction(importId: string, reviewId: string, value: string | null): Promise<ActionResult> {
  return run("decide_review", async () => {
    const ctx = await getOrgContext();
    if (!ctx.can("imports.manage") && !ctx.can("imports.preview")) throw new AuthError("forbidden");
    await decideReview(ctx, importId, reviewId, value);
    revalidatePath(`/app/imports/${importId}`);
  });
}

export async function acceptAllAction(importId: string): Promise<ActionResult> {
  return run("accept_all", async () => {
    const ctx = await getOrgContext();
    if (!ctx.can("imports.manage") && !ctx.can("imports.preview")) throw new AuthError("forbidden");
    const n = await acceptAllSuggestions(ctx, importId);
    revalidatePath(`/app/imports/${importId}`);
    return { ok: `Accepted ${n} suggested value${n === 1 ? "" : "s"}.` };
  });
}

export async function commitImportAction(importId: string, skipDuplicates: boolean): Promise<ActionResult> {
  return run("commit_import", async () => {
    const ctx = await getOrgContext();
    if (ctx.org.isDemo) return { error: "Committing imports is disabled in the demonstration workspace. Everything up to this step uses your file for real." };
    if (!ctx.can("imports.manage")) throw new AuthError("forbidden");
    const r = await commitImport(ctx, importId, { skipDuplicates });
    revalidatePath(`/app/imports/${importId}`);
    revalidatePath("/app");
    return "error" in r ? { error: r.error } : { ok: "Import complete." };
  });
}

export async function cancelImportAction(importId: string): Promise<ActionResult> {
  return run("cancel_import", async () => {
    const ctx = await getOrgContext();
    if (!ctx.can("imports.manage") && !ctx.can("imports.preview")) throw new AuthError("forbidden");
    await cancelImport(ctx, importId);
    revalidatePath("/app/imports");
    return { ok: "Import cancelled. The uploaded file was deleted." };
  });
}

/* ------------------------------------------------------------------ search */
export type SearchHit = { id: string; name: string; sub: string };
export async function searchAction(q: string): Promise<SearchHit[]> {
  const query = q.trim().toLowerCase().slice(0, 100);
  if (query.length < 2) return [];
  try {
    const ctx = await getOrgContext();
    const p = await loadPortfolio(ctx.org.id);
    return p.facts
      .filter((m) => [m.name, m.externalId, m.attorneyName, m.categoryLabel, m.referralName].some((v) => v?.toLowerCase().includes(query)))
      .slice(0, 12)
      .map((m) => ({ id: m.id, name: m.name, sub: [m.externalId, m.categoryLabel, m.attorneyName, m.status === "open" ? "Open" : "Closed"].filter(Boolean).join(" · ") }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ activity */
export async function markActivityReadAction() {
  const ctx = await getOrgContext();
  await withTenant(ctx.org.id, (tx) => tx.insert(notificationReads).values({ userId: ctx.user.id, organizationId: ctx.org.id, lastReadAt: new Date() })
    .onConflictDoUpdate({ target: [notificationReads.userId, notificationReads.organizationId], set: { lastReadAt: new Date() } }));
}

/* ------------------------------------------------------------------ onboarding */
const onboardingSchema = z.object({
  name: z.string().min(2, "Enter your organization's name.").max(160),
  attorneyCount: z.string().max(20).optional(),
  matterVolume: z.string().max(20).optional(),
  practiceArea: z.enum(PRACTICE_AREAS.map((p) => p.key) as [PracticeArea, ...PracticeArea[]]),
  caseManagementSystem: z.string().max(60).optional(),
  userTitle: z.string().max(80).optional(),
});

export async function saveOnboardingAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("onboarding", async () => {
    const input = onboardingSchema.parse({
      name: String(fd.get("name") ?? "").trim(), attorneyCount: String(fd.get("attorneyCount") ?? "") || undefined,
      matterVolume: String(fd.get("matterVolume") ?? "") || undefined, practiceArea: fd.get("practiceArea"),
      caseManagementSystem: String(fd.get("caseManagementSystem") ?? "") || undefined, userTitle: String(fd.get("userTitle") ?? "") || undefined,
    });
    const s = await requireUser();
    const existing = (await listMemberships(s.userId)).filter((m) => !m.isDemo);
    if (!existing.length) {
      // A user without an organization (platform administrator or open sign-up) creates one here.
      const org = await createOrganization({ name: input.name, practiceArea: input.practiceArea, ownerUserId: s.userId, ownerName: s.user.name, attorneyCount: input.attorneyCount, matterVolume: input.matterVolume, caseManagementSystem: input.caseManagementSystem });
      await ensureAttorneyForMember(systemDb(), org.id, s.userId, s.user.name, input.userTitle);
      await systemDb().update(sessions).set({ activeOrganizationId: org.id }).where(eq(sessions.id, s.id));
      return { ok: "saved", id: org.id };
    }
    const ctx = await getOrgContext();
    if (!ctx.can("org.manage")) throw new AuthError("forbidden");
    await withTenant(ctx.org.id, async (tx) => {
      await tx.update(organizations).set({ name: input.name, practiceArea: input.practiceArea, attorneyCount: input.attorneyCount, matterVolume: input.matterVolume, caseManagementSystem: input.caseManagementSystem }).where(eq(organizations.id, ctx.org.id));
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, actorLabel: ctx.user.name, action: "settings.changed", summary: "Completed organization profile during onboarding" });
    });
    return { ok: "saved", id: ctx.org.id };
  });
}

export async function completeOnboardingAction(path: "import" | "demo" | "workspace") {
  const ctx = await getOrgContext();
  if (ctx.can("org.manage") && !ctx.org.onboardingCompletedAt) {
    await withTenant(ctx.org.id, (tx) => tx.update(organizations).set({ onboardingCompletedAt: new Date() }).where(eq(organizations.id, ctx.org.id)));
  }
  if (path === "demo") return exploreDemoAction();
  redirect(path === "import" ? "/app/imports/new" : "/app");
}

/** Gives a real user read-only access to the synthetic demonstration workspace and switches to it. */
export async function exploreDemoAction() {
  const s = await requireUser();
  const demoOrg = (await systemDb().select().from(organizations).where(eq(organizations.isDemo, true)).limit(1))[0];
  if (!demoOrg) redirect("/app?demo=unavailable");
  const has = (await systemDb().select().from(memberships).where(and(eq(memberships.userId, s.userId), eq(memberships.organizationId, demoOrg.id))).limit(1))[0];
  if (!has) await systemDb().insert(memberships).values({ organizationId: demoOrg.id, userId: s.userId, role: "demo" });
  await systemDb().update(sessions).set({ activeOrganizationId: demoOrg.id }).where(eq(sessions.id, s.id));
  redirect("/app");
}
