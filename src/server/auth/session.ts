import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { systemDb } from "@/server/db";
import { memberships, organizations, sessions, users } from "@/server/db/schema";
import { hmac, newToken, sha256 } from "./crypto";
import { SESSION_ABSOLUTE_MS, SESSION_COOKIE, SESSION_IDLE_MS } from "./constants";
import { can, type Permission, type Role } from "@/lib/roles";
import { readOrgSettings, type OrgSettings } from "@/server/org-settings";

export type SessionUser = {
  id: string; email: string; name: string; title: string | null;
  isPlatformAdmin: boolean; isDemoUser: boolean; mfaEnabled: boolean;
};

export type OrgContext = {
  sessionId: string;
  user: SessionUser;
  org: { id: string; name: string; isDemo: boolean; timezone: string; currency: string; practiceArea: string | null; onboardingCompletedAt: Date | null; deletionRequestedAt: Date | null; settings: OrgSettings };
  role: Role;
  attorneyId: string | null;
  can: (p: Permission) => boolean;
};

export class AuthError extends Error {
  constructor(public code: "unauthenticated" | "forbidden" | "no_org", message?: string) {
    super(message ?? code);
  }
}

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
  return hmac(ip);
}

/** Creates a session row and sets the cookie. Call only from Server Actions / Route Handlers. */
export async function createSession(userId: string, opts: { mfaPending: boolean; activeOrganizationId?: string | null }) {
  const token = newToken();
  const now = Date.now();
  const h = await headers();
  await systemDb().insert(sessions).values({
    tokenHash: sha256(token),
    userId,
    mfaPending: opts.mfaPending,
    activeOrganizationId: opts.activeOrganizationId ?? null,
    userAgent: (h.get("user-agent") ?? "").slice(0, 200),
    ipHash: await clientIpHash(),
    expiresAt: new Date(now + SESSION_ABSOLUTE_MS),
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(now + SESSION_ABSOLUTE_MS),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await systemDb().delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

type LoadedSession = { id: string; userId: string; activeOrganizationId: string | null; mfaPending: boolean; user: SessionUser };

/** Validates the session cookie. Cached for the duration of one request. */
export const getSession = cache(async (): Promise<LoadedSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const db = systemDb();
  const rows = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, sha256(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const now = Date.now();
  if (row.s.expiresAt.getTime() <= now || row.s.lastSeenAt.getTime() + SESSION_IDLE_MS <= now || row.u.disabledAt) {
    await db.delete(sessions).where(eq(sessions.id, row.s.id));
    return null;
  }
  if (now - row.s.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, row.s.id));
  }
  return {
    id: row.s.id,
    userId: row.u.id,
    activeOrganizationId: row.s.activeOrganizationId,
    mfaPending: row.s.mfaPending,
    user: {
      id: row.u.id, email: row.u.email, name: row.u.name, title: row.u.title,
      isPlatformAdmin: row.u.isPlatformAdmin, isDemoUser: row.u.isDemoUser, mfaEnabled: row.u.mfaEnabled,
    },
  };
});

/** Requires a fully authenticated (MFA-complete) user. */
export async function requireUser(): Promise<LoadedSession> {
  const s = await getSession();
  if (!s) throw new AuthError("unauthenticated");
  if (s.mfaPending) throw new AuthError("unauthenticated", "mfa_pending");
  return s;
}

export async function listMemberships(userId: string) {
  return systemDb()
    .select({ orgId: organizations.id, name: organizations.name, isDemo: organizations.isDemo, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId))
    .orderBy(organizations.isDemo, organizations.name);
}

/**
 * Resolves the user's active organization and role. This is the single gate for
 * every tenant operation: the organization id used for data access comes from
 * here, never from request input.
 */
export const getOrgContext = cache(async (): Promise<OrgContext> => {
  const s = await requireUser();
  const db = systemDb();
  let orgId = s.activeOrganizationId;
  let m = orgId
    ? (await db.select().from(memberships).where(and(eq(memberships.userId, s.userId), eq(memberships.organizationId, orgId))).limit(1))[0]
    : undefined;
  if (!m) {
    const first = (await listMemberships(s.userId))[0];
    if (!first) throw new AuthError("no_org");
    orgId = first.orgId;
    m = (await db.select().from(memberships).where(and(eq(memberships.userId, s.userId), eq(memberships.organizationId, orgId))).limit(1))[0];
    await db.update(sessions).set({ activeOrganizationId: orgId }).where(eq(sessions.id, s.id));
  }
  if (!m || !orgId) throw new AuthError("no_org");
  const org = (await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1))[0];
  if (!org) throw new AuthError("no_org");
  const role = m.role as Role;
  return {
    sessionId: s.id,
    user: s.user,
    org: {
      id: org.id, name: org.name, isDemo: org.isDemo, timezone: org.timezone, currency: org.currency,
      practiceArea: org.practiceArea, onboardingCompletedAt: org.onboardingCompletedAt,
      deletionRequestedAt: org.deletionRequestedAt, settings: readOrgSettings(org.settings),
    },
    role,
    attorneyId: m.attorneyId,
    can: (p: Permission) => can(role, p),
  };
});

/** For pages: redirect anonymous users to login instead of throwing. */
export async function pageOrgContext(next = "/app"): Promise<OrgContext> {
  try {
    return await getOrgContext();
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "no_org") redirect("/app/onboarding");
      if (e.message === "mfa_pending") redirect("/login/mfa");
      redirect(`/login?next=${encodeURIComponent(next)}`);
    }
    throw e;
  }
}

/** For server actions: require a permission or throw a forbidden error. */
export async function requirePermission(p: Permission): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx.can(p)) throw new AuthError("forbidden", `Your role does not permit this action.`);
  return ctx;
}

export async function revokeOtherSessions(userId: string, keepSessionId?: string) {
  const db = systemDb();
  if (keepSessionId) await db.delete(sessions).where(and(eq(sessions.userId, userId), sql`${sessions.id} <> ${keepSessionId}`));
  else await db.delete(sessions).where(eq(sessions.userId, userId));
}
