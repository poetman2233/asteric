import { sql } from "drizzle-orm";
import { systemDb } from "@/server/db";
import { users } from "@/server/db/schema";
import { createOrganization, ensureAttorneyForMember } from "@/server/services/accounts";
import { can, type Role } from "@/lib/roles";
import { DEFAULT_ORG_SETTINGS } from "@/server/org-settings";
import type { OrgContext } from "@/server/auth/session";

export async function resetDb() {
  await systemDb().execute(sql`
    truncate table audit_events, provenance, import_value_reviews, import_rows, import_files, imports, outcomes, offers,
      procedural_events, predictions, matters, categories, referral_sources, attorneys, invitations, memberships, sessions,
      auth_tokens, rate_limits, access_requests, notification_reads, saved_views, users, organizations cascade`);
}

let n = 0;
/** Creates an organization plus a member with `role`, returning a server-side OrgContext for that member. */
export async function makeOrg(name: string, role: Role = "owner", opts: { isDemo?: boolean } = {}): Promise<OrgContext> {
  n++;
  const [owner] = await systemDb().insert(users).values({ email: `owner${n}@${name.toLowerCase().replace(/\W/g, "")}.test`, name: `Owner ${n}`, emailVerifiedAt: new Date() }).returning();
  const org = await createOrganization({ name, practiceArea: "employment", ownerUserId: owner!.id, ownerName: owner!.name, isDemo: opts.isDemo });
  const att = await ensureAttorneyForMember(systemDb(), org.id, owner!.id, owner!.name);
  return ctxFor(org.id, org.name, owner!.id, owner!.name, role, att.id, opts.isDemo ?? false);
}

export function ctxFor(orgId: string, orgName: string, userId: string, userName: string, role: Role, attorneyId: string | null, isDemo = false): OrgContext {
  return {
    sessionId: "test",
    user: { id: userId, email: `${userId}@test`, name: userName, title: null, isPlatformAdmin: false, isDemoUser: role === "demo", mfaEnabled: false },
    org: { id: orgId, name: orgName, isDemo, timezone: "UTC", currency: "USD", practiceArea: "employment", onboardingCompletedAt: new Date(), deletionRequestedAt: null, settings: DEFAULT_ORG_SETTINGS },
    role, attorneyId, can: (p) => can(role, p),
  };
}
