"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { systemDb, withTenant } from "@/server/db";
import { invitations, memberships, organizations, sessions, users } from "@/server/db/schema";
import { AuthError, getOrgContext, requireUser, revokeOtherSessions } from "@/server/auth/session";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/crypto";
import { newMfaEnrollment, newRecoveryCodes, verifyTotp } from "@/server/auth/mfa";
import { createInvitation, ensureAttorneyForMember } from "@/server/services/accounts";
import { rateLimit } from "@/server/auth/rate-limit";
import { audit } from "@/server/audit";
import { run, UserError, type ActionResult } from "@/server/action-runner";
import { assignableRoles, ROLE_LABEL, type Role } from "@/lib/roles";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const optNum = (fd: FormData, k: string) => { const s = str(fd, k).replace(/[$,%\s]/g, ""); return s === "" ? null : Number(s); };

function noDemo(isDemoUser: boolean) {
  if (isDemoUser) throw new UserError("The demonstration account cannot change account settings.");
}

/* ------------------------------------------------------------------ profile */
export async function updateProfileAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("profile", async () => {
    const s = await requireUser();
    noDemo(s.user.isDemoUser);
    const v = z.object({ name: z.string().min(2, "Enter your name.").max(120), title: z.string().max(80) }).parse({ name: str(fd, "name"), title: str(fd, "title") });
    await systemDb().update(users).set({ name: v.name, title: v.title || null }).where(eq(users.id, s.userId));
    revalidatePath("/app", "layout");
    return { ok: "Profile updated." };
  });
}

export async function changePasswordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("password", async () => {
    const s = await requireUser();
    noDemo(s.user.isDemoUser);
    if (!(await rateLimit(`pwchange:${s.userId}`, 6, 900))) return { error: "Too many attempts. Wait a few minutes and try again." };
    const user = (await systemDb().select().from(users).where(eq(users.id, s.userId)).limit(1))[0]!;
    if (!(await verifyPassword(String(fd.get("current") ?? ""), user.passwordHash))) return { error: "Your current password is incorrect." };
    const next = String(fd.get("next") ?? "");
    const problem = passwordProblem(next, user.email);
    if (problem) return { error: problem };
    await systemDb().update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, s.userId));
    await revokeOtherSessions(s.userId, s.id);
    await audit(systemDb(), { organizationId: s.activeOrganizationId, actorUserId: s.userId, actorLabel: user.name, action: "auth.password_changed", summary: "Changed password and signed out other sessions" });
    return { ok: "Password changed. Other sessions were signed out." };
  });
}

/* ------------------------------------------------------------------ MFA */
export async function startMfaAction(): Promise<ActionResult> {
  return run("mfa_start", async () => {
    const s = await requireUser();
    noDemo(s.user.isDemoUser);
    if (s.user.mfaEnabled) return { error: "Two-factor authentication is already on." };
    const e = await newMfaEnrollment(s.user.email);
    // Stored encrypted but inactive until a code is confirmed.
    await systemDb().update(users).set({ mfaSecretEnc: e.secretEnc }).where(eq(users.id, s.userId));
    return { ok: "started", data: { qr: e.qrDataUrl, secret: e.secret } };
  });
}

export async function confirmMfaAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("mfa_confirm", async () => {
    const s = await requireUser();
    noDemo(s.user.isDemoUser);
    if (!(await rateLimit(`mfaenroll:${s.userId}`, 10, 900))) return { error: "Too many attempts. Wait a few minutes and try again." };
    const user = (await systemDb().select().from(users).where(eq(users.id, s.userId)).limit(1))[0]!;
    if (!user.mfaSecretEnc || !verifyTotp(user.mfaSecretEnc, user.email, str(fd, "code"))) return { error: "That code is not valid. Check the time on your device and try again." };
    const rc = newRecoveryCodes();
    await systemDb().update(users).set({ mfaEnabled: true, mfaRecoveryHashes: rc.hashes }).where(eq(users.id, s.userId));
    await revokeOtherSessions(s.userId, s.id);
    await audit(systemDb(), { organizationId: s.activeOrganizationId, actorUserId: s.userId, actorLabel: user.name, action: "auth.mfa_enabled", summary: "Turned on two-factor authentication" });
    return { ok: "Two-factor authentication is on.", data: { codes: rc.codes } };
  });
}

export async function disableMfaAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("mfa_disable", async () => {
    const s = await requireUser();
    noDemo(s.user.isDemoUser);
    const user = (await systemDb().select().from(users).where(eq(users.id, s.userId)).limit(1))[0]!;
    if (!(await verifyPassword(String(fd.get("password") ?? ""), user.passwordHash))) return { error: "Your password is incorrect." };
    await systemDb().update(users).set({ mfaEnabled: false, mfaSecretEnc: null, mfaRecoveryHashes: null }).where(eq(users.id, s.userId));
    await audit(systemDb(), { organizationId: s.activeOrganizationId, actorUserId: s.userId, actorLabel: user.name, action: "auth.mfa_disabled", summary: "Turned off two-factor authentication" });
    revalidatePath("/app/settings/security");
    return { ok: "Two-factor authentication is off." };
  });
}

export async function revokeSessionAction(sessionId: string): Promise<ActionResult> {
  return run("session_revoke", async () => {
    const s = await requireUser();
    if (sessionId === s.id) return { error: "Use Sign out to end the current session." };
    await systemDb().delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, s.userId)));
    revalidatePath("/app/settings/security");
    return { ok: "Session signed out." };
  });
}

export async function revokeAllOtherSessionsAction(): Promise<ActionResult> {
  return run("session_revoke_all", async () => {
    const s = await requireUser();
    await revokeOtherSessions(s.userId, s.id);
    revalidatePath("/app/settings/security");
    return { ok: "All other sessions were signed out." };
  });
}

/* ------------------------------------------------------------------ organization */
export async function updateOrganizationAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("org_update", async () => {
    const ctx = await getOrgContext();
    if (!ctx.can("org.manage") || ctx.org.isDemo) throw new AuthError("forbidden");
    const hourly = optNum(fd, "attorneyHourlyCost");
    const rate = optNum(fd, "defaultContingencyRate");
    const v = z.object({
      name: z.string().min(2, "Enter the organization name.").max(160),
      timezone: z.string().min(3).max(64).refine((t) => { try { new Intl.DateTimeFormat("en-US", { timeZone: t }); return true; } catch { return false; } }, "Choose a valid time zone."),
      attorneyHourlyCost: z.number().min(0).max(5000).nullable(),
      defaultContingencyRate: z.number().min(0).max(100).nullable(),
      staleDays: z.number().int().min(30).max(730),
      expenseVarianceThreshold: z.number().min(5).max(200),
    }).parse({ name: str(fd, "name"), timezone: str(fd, "timezone"), attorneyHourlyCost: hourly, defaultContingencyRate: rate, staleDays: optNum(fd, "staleDays") ?? 180, expenseVarianceThreshold: optNum(fd, "expenseVarianceThreshold") ?? 25 });
    const settings = {
      ...ctx.org.settings,
      attorneyHourlyCost: v.attorneyHourlyCost,
      defaultContingencyRate: v.defaultContingencyRate == null ? null : v.defaultContingencyRate / 100,
      expensesReimbursedFromRecovery: fd.get("expensesReimbursedFromRecovery") === "on",
      staleDays: v.staleDays,
      expenseVarianceThreshold: v.expenseVarianceThreshold / 100,
      analystsSeePredictionAuthors: fd.get("analystsSeePredictionAuthors") === "on",
      aiAssistEnabled: fd.get("aiAssistEnabled") === "on",
      momentEventTypes: fd.getAll("momentEventTypes").map(String).filter((x) => /^[a-z_]{3,40}$/.test(x)),
      momentOnOffers: fd.get("momentOnOffers") === "on",
      momentExpenseThreshold: (() => { const n = optNum(fd, "momentExpenseThreshold"); return n != null && Number.isFinite(n) && n >= 0 ? n : null; })(),
    };
    await withTenant(ctx.org.id, async (tx) => {
      await tx.update(organizations).set({ name: v.name, timezone: v.timezone, settings }).where(eq(organizations.id, ctx.org.id));
      const before = ctx.org.settings as Record<string, unknown>;
      const changed = Object.keys(settings).filter((k) => JSON.stringify(before[k]) !== JSON.stringify((settings as Record<string, unknown>)[k]));
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, actorLabel: ctx.user.name, action: "settings.changed", summary: `Updated organization settings${changed.length ? `: ${changed.join(", ")}` : ""}`, metadata: { changed } });
    });
    revalidatePath("/app", "layout");
    return { ok: "Organization settings saved." };
  });
}

/* ------------------------------------------------------------------ team */
export async function inviteMemberAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("invite", async () => {
    const ctx = await getOrgContext();
    if (!ctx.can("team.manage") || ctx.org.isDemo) throw new AuthError("forbidden");
    if (!(await rateLimit(`invite:${ctx.org.id}`, 50, 86400))) return { error: "Invitation limit reached for today." };
    const email = z.email("Enter a valid email address.").parse(str(fd, "email"));
    const role = str(fd, "role") as Role;
    if (!assignableRoles(ctx.role).includes(role)) return { error: "You cannot assign that role." };
    const existing = (await systemDb().select({ id: memberships.id }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organizationId, ctx.org.id), eq(users.email, email.toLowerCase()))).limit(1))[0];
    if (existing) return { error: "That person is already a member." };
    const r = await withTenant(ctx.org.id, async (tx) => {
      const out = await createInvitation(tx, { orgId: ctx.org.id, orgName: ctx.org.name, email, role, invitedBy: ctx.user.id, invitedByName: ctx.user.name });
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, actorLabel: ctx.user.name, action: "invitation.created", summary: `Invited ${email} as ${ROLE_LABEL[role]}` });
      return out;
    });
    revalidatePath("/app/settings/team");
    return r.delivered ? { ok: `Invitation emailed to ${email}.` } : { ok: `Invitation created. Email is not configured, so share this link with ${email} directly (it expires in 7 days):`, data: { link: r.link } };
  });
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionResult> {
  return run("invite_revoke", async () => {
    const ctx = await getOrgContext();
    if (!ctx.can("team.manage")) throw new AuthError("forbidden");
    await withTenant(ctx.org.id, async (tx) => {
      const r = await tx.update(invitations).set({ revokedAt: new Date() }).where(and(eq(invitations.id, invitationId), eq(invitations.organizationId, ctx.org.id), isNull(invitations.acceptedAt))).returning();
      if (r[0]) await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, actorLabel: ctx.user.name, action: "invitation.revoked", summary: `Revoked invitation for ${r[0].email}` });
    });
    revalidatePath("/app/settings/team");
    return { ok: "Invitation revoked." };
  });
}

async function ownerCount(orgId: string) {
  return Number((await systemDb().select({ n: count() }).from(memberships).where(and(eq(memberships.organizationId, orgId), eq(memberships.role, "owner"))))[0]?.n ?? 0);
}

export async function changeRoleAction(membershipId: string, role: Role): Promise<ActionResult> {
  return run("role_change", async () => {
    const ctx = await getOrgContext();
    if (!ctx.can("team.manage") || ctx.org.isDemo) throw new AuthError("forbidden");
    if (!assignableRoles(ctx.role).includes(role)) return { error: "You cannot assign that role." };
    const m = (await systemDb().select({ m: memberships, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.org.id))).limit(1))[0];
    if (!m) return { error: "Member not found." };
    if (m.m.role === "owner" && ctx.role !== "owner") return { error: "Only an owner can change another owner's role." };
    if (m.m.role === "owner" && role !== "owner" && (await ownerCount(ctx.org.id)) <= 1) return { error: "An organization must keep at least one owner." };
    await withTenant(ctx.org.id, async (tx) => {
      await tx.update(memberships).set({ role }).where(eq(memberships.id, membershipId));
      if (role === "attorney" || role === "owner" || role === "admin") await ensureAttorneyForMember(tx, ctx.org.id, m.m.userId, m.name);
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, actorLabel: ctx.user.name, action: "member.role_changed", summary: `Changed ${m.name}'s role from ${ROLE_LABEL[m.m.role]} to ${ROLE_LABEL[role]}` });
    });
    revalidatePath("/app/settings/team");
    return { ok: "Role updated." };
  });
}

export async function removeMemberAction(membershipId: string): Promise<ActionResult> {
  return run("member_remove", async () => {
    const ctx = await getOrgContext();
    if (!ctx.can("team.manage") || ctx.org.isDemo) throw new AuthError("forbidden");
    const m = (await systemDb().select({ m: memberships, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, ctx.org.id))).limit(1))[0];
    if (!m) return { error: "Member not found." };
    if (m.m.userId === ctx.user.id) return { error: "You cannot remove yourself. Ask another owner or administrator." };
    if (m.m.role === "owner" && ctx.role !== "owner") return { error: "Only an owner can remove an owner." };
    if (m.m.role === "owner" && (await ownerCount(ctx.org.id)) <= 1) return { error: "An organization must keep at least one owner." };
    await withTenant(ctx.org.id, async (tx) => {
      await tx.delete(memberships).where(eq(memberships.id, membershipId));
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, actorLabel: ctx.user.name, action: "member.removed", summary: `Removed ${m.name} from the organization` });
    });
    // End their sessions that point at this organization.
    await systemDb().delete(sessions).where(and(eq(sessions.userId, m.m.userId), eq(sessions.activeOrganizationId, ctx.org.id)));
    revalidatePath("/app/settings/team");
    return { ok: `${m.name} was removed. Their recorded predictions remain in the ledger.` };
  });
}

/* ------------------------------------------------------------------ deletion */
export async function requestDeletionAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run("org_delete_request", async () => {
    const ctx = await getOrgContext();
    if (!ctx.can("org.delete") || ctx.org.isDemo) throw new AuthError("forbidden", "Only an owner can delete the organization.");
    if (str(fd, "confirm") !== ctx.org.name) return { error: "Type the organization name exactly to confirm." };
    const user = (await systemDb().select().from(users).where(eq(users.id, ctx.user.id)).limit(1))[0]!;
    if (!(await verifyPassword(String(fd.get("password") ?? ""), user.passwordHash))) return { error: "Your password is incorrect." };
    await withTenant(ctx.org.id, async (tx) => {
      await tx.update(organizations).set({ deletionRequestedAt: new Date(), deletionRequestedBy: ctx.user.id }).where(eq(organizations.id, ctx.org.id));
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, actorLabel: ctx.user.name, action: "organization.deletion_requested", summary: "Requested permanent deletion of the organization (30-day grace period)" });
    });
    revalidatePath("/app", "layout");
    return { ok: "Deletion scheduled." };
  });
}

export async function cancelDeletionAction(): Promise<ActionResult> {
  return run("org_delete_cancel", async () => {
    const ctx = await getOrgContext();
    if (!ctx.can("org.delete")) throw new AuthError("forbidden");
    await withTenant(ctx.org.id, async (tx) => {
      await tx.update(organizations).set({ deletionRequestedAt: null, deletionRequestedBy: null }).where(eq(organizations.id, ctx.org.id));
      await audit(tx, { organizationId: ctx.org.id, actorUserId: ctx.user.id, actorLabel: ctx.user.name, action: "organization.deletion_cancelled", summary: "Cancelled the scheduled deletion of the organization" });
    });
    revalidatePath("/app", "layout");
    return { ok: "Deletion cancelled." };
  });
}

/** Leaves the demonstration workspace (removes the demo membership) and returns to the user's organization. */
export async function leaveDemoAction() {
  const s = await requireUser();
  const demo = (await systemDb().select().from(organizations).where(eq(organizations.isDemo, true)).limit(1))[0];
  if (demo && !s.user.isDemoUser) await systemDb().delete(memberships).where(and(eq(memberships.userId, s.userId), eq(memberships.organizationId, demo.id)));
  const next = (await systemDb().select({ org: memberships.organizationId }).from(memberships).where(and(eq(memberships.userId, s.userId), ne(memberships.organizationId, demo?.id ?? "00000000-0000-0000-0000-000000000000"))).limit(1))[0];
  await systemDb().update(sessions).set({ activeOrganizationId: next?.org ?? null }).where(eq(sessions.id, s.id));
  redirect("/app");
}

