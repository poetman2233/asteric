"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { systemDb } from "@/server/db";
import { accessRequests, organizations } from "@/server/db/schema";
import { AuthError, requireUser } from "@/server/auth/session";
import { createInvitation, createOrganization } from "@/server/services/accounts";
import { audit } from "@/server/audit";
import { run, type ActionResult } from "@/server/action-runner";
import { PRACTICE_AREAS, type PracticeArea } from "@/lib/taxonomy";

async function requireAdmin() {
  const s = await requireUser();
  if (!s.user.isPlatformAdmin) throw new AuthError("forbidden", "Platform administrators only.");
  return s;
}

const provisionSchema = z.object({
  firm: z.string().min(2, "Enter the firm name.").max(160),
  ownerEmail: z.email("Enter the owner's email address."),
  practiceArea: z.enum(PRACTICE_AREAS.map((p) => p.key) as [PracticeArea, ...PracticeArea[]]),
  requestId: z.string().uuid().optional(),
});

/** Creates an organization and invites its first owner. The administrator does not become a member. */
export async function provisionOrgAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("admin_provision", async () => {
    const s = await requireAdmin();
    const v = provisionSchema.parse({ firm: String(fd.get("firm") ?? "").trim(), ownerEmail: String(fd.get("ownerEmail") ?? "").trim(), practiceArea: fd.get("practiceArea") ?? "employment", requestId: String(fd.get("requestId") ?? "") || undefined });
    const db = systemDb();
    const out = await db.transaction(async (tx) => {
      const org = await createOrganization({ name: v.firm, practiceArea: v.practiceArea, ownerUserId: null, ownerName: s.user.name }, tx);
      const inv = await createInvitation(tx, { orgId: org.id, orgName: org.name, email: v.ownerEmail, role: "owner", invitedBy: s.userId, invitedByName: "Asteric" });
      if (v.requestId) await tx.update(accessRequests).set({ status: "approved", organizationId: org.id }).where(eq(accessRequests.id, v.requestId));
      await audit(tx, { organizationId: null, actorUserId: s.userId, actorLabel: s.user.name, action: "platform.org_provisioned", objectType: "organization", objectId: org.id, summary: `Provisioned ${org.name} and invited its owner` });
      return { org, inv };
    });
    revalidatePath("/admin");
    return out.inv.delivered
      ? { ok: `${out.org.name} created. The owner invitation was emailed to ${v.ownerEmail}.` }
      : { ok: `${out.org.name} created. Email is not configured; send this owner invitation link to ${v.ownerEmail} (expires in 7 days):`, data: { link: out.inv.link } };
  });
}

export async function setRequestStatusAction(id: string, status: "declined" | "new" | "contacted"): Promise<ActionResult> {
  return run("admin_request_status", async () => {
    const s = await requireAdmin();
    await systemDb().update(accessRequests).set({ status }).where(eq(accessRequests.id, id));
    await audit(systemDb(), { organizationId: null, actorUserId: s.userId, actorLabel: s.user.name, action: "platform.access_request_updated", summary: `Marked an access request ${status}` });
    revalidatePath("/admin");
  });
}

export async function cancelOrgDeletionAction(orgId: string): Promise<ActionResult> {
  return run("admin_cancel_deletion", async () => {
    const s = await requireAdmin();
    await systemDb().update(organizations).set({ deletionRequestedAt: null, deletionRequestedBy: null }).where(eq(organizations.id, orgId));
    await audit(systemDb(), { organizationId: orgId, actorUserId: s.userId, actorLabel: `${s.user.name} (Asteric support)`, action: "organization.deletion_cancelled", summary: "Asteric support cancelled the scheduled deletion at the owner's request" });
    revalidatePath("/admin");
  });
}

/** Creates or regenerates the synthetic demonstration workspace. Touches only the is_demo organization. */
export async function regenerateDemoAction(): Promise<ActionResult> {
  return run("admin_seed_demo", async () => {
    const s = await requireAdmin();
    const { seedDemo } = await import("@/server/demo/seed");
    const r = await seedDemo();
    await audit(systemDb(), { organizationId: null, actorUserId: s.userId, actorLabel: s.user.name, action: "platform.demo_regenerated", summary: `Regenerated the demonstration workspace (${r.matters} synthetic matters)` });
    revalidatePath("/admin");
    return { ok: `Demo workspace ready: ${r.matters} synthetic matters.` };
  });
}
