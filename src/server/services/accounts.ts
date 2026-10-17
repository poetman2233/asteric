import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { systemDb, type Db, type Tx } from "@/server/db";
import { attorneys, categories, invitations, memberships, organizations, users } from "@/server/db/schema";
import { DEFAULT_CATEGORIES, type PracticeArea } from "@/lib/taxonomy";
import { DEFAULT_ORG_SETTINGS } from "@/server/org-settings";
import { newToken, sha256 } from "@/server/auth/crypto";
import { audit } from "@/server/audit";
import { sendEmail } from "@/server/email";
import { config } from "@/server/config";
import type { Role } from "@/lib/roles";

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function findUserByEmail(email: string) {
  return (await systemDb().select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1))[0];
}

/** Creates an organization, its canonical categories, and the owner membership. */
export async function createOrganization(input: {
  name: string; practiceArea: PracticeArea; ownerUserId: string | null; ownerName: string;
  attorneyCount?: string; matterVolume?: string; caseManagementSystem?: string; isDemo?: boolean; timezone?: string;
}, db: Db | Tx = systemDb()) {
  const [org] = await db.insert(organizations).values({
    name: input.name.trim(),
    practiceArea: input.practiceArea,
    attorneyCount: input.attorneyCount,
    matterVolume: input.matterVolume,
    caseManagementSystem: input.caseManagementSystem,
    isDemo: input.isDemo ?? false,
    timezone: input.timezone ?? "America/Los_Angeles",
    settings: DEFAULT_ORG_SETTINGS,
  }).returning();
  const defaults = DEFAULT_CATEGORIES[input.practiceArea] ?? DEFAULT_CATEGORIES.employment;
  await db.insert(categories).values(defaults.map((c, i) => ({ organizationId: org!.id, key: c.key, label: c.label, practiceArea: input.practiceArea, sort: i })));
  // Provisioned by a platform administrator: the owner joins later by accepting an invitation.
  if (input.ownerUserId) await db.insert(memberships).values({ organizationId: org!.id, userId: input.ownerUserId, role: "owner" });
  await audit(db, { organizationId: org!.id, actorUserId: input.ownerUserId, actorLabel: input.ownerName, action: "organization.created", summary: `Created organization ${org!.name}`, objectType: "organization", objectId: org!.id });
  return org!;
}

/** Links (or creates) the attorney record for a member so predictions are attributed. */
export async function ensureAttorneyForMember(db: Db | Tx, orgId: string, userId: string, name: string, title?: string | null) {
  const existing = (await db.select().from(attorneys).where(and(eq(attorneys.organizationId, orgId), eq(attorneys.name, name))).limit(1))[0];
  const att = existing ?? (await db.insert(attorneys).values({ organizationId: orgId, name, title: title ?? null, userId }).returning())[0]!;
  if (!existing?.userId) await db.update(attorneys).set({ userId }).where(eq(attorneys.id, att.id));
  await db.update(memberships).set({ attorneyId: att.id }).where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, userId)));
  return att;
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Creates an invitation and emails it. Returns the link so an admin can share it if email is not configured. */
export async function createInvitation(db: Db | Tx, input: { orgId: string; orgName: string; email: string; role: Role; invitedBy: string; invitedByName: string }) {
  const email = normalizeEmail(input.email);
  await db.update(invitations).set({ revokedAt: new Date() })
    .where(and(eq(invitations.organizationId, input.orgId), eq(invitations.email, email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
  const token = newToken();
  const [inv] = await db.insert(invitations).values({
    organizationId: input.orgId, email, role: input.role, tokenHash: sha256(token), invitedBy: input.invitedBy, expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  }).returning();
  const link = `${config.appUrl}/invite/${token}`;
  const res = await sendEmail({
    to: email,
    subject: `You have been invited to ${input.orgName} on Asteric`,
    text: `${input.invitedByName} invited you to join ${input.orgName} on Asteric.\n\nAccept the invitation: ${link}\n\nThis link expires in 7 days. If you were not expecting this, you can ignore this email.`,
    link,
  });
  await audit(db, { organizationId: input.orgId, actorUserId: input.invitedBy, actorLabel: input.invitedByName, action: "team.invited", summary: `Invited ${email} as ${input.role}`, objectType: "invitation", objectId: inv!.id, metadata: { role: input.role, emailDelivered: res.delivered } });
  return { invitation: inv!, link, delivered: res.delivered };
}

export async function findInvitation(token: string) {
  const rows = await systemDb()
    .select({ inv: invitations, orgName: organizations.name })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .where(and(eq(invitations.tokenHash, sha256(token)), isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())))
    .limit(1);
  return rows[0];
}
