"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull, gt } from "drizzle-orm";
import { z } from "zod";
import { systemDb } from "@/server/db";
import { accessRequests, authTokens, invitations, memberships, organizations, sessions, users } from "@/server/db/schema";
import { hashPassword, newToken, passwordProblem, sha256, verifyPassword } from "@/server/auth/crypto";
import { clientIpHash, createSession, destroySession, getSession, revokeOtherSessions } from "@/server/auth/session";
import { rateLimit } from "@/server/auth/rate-limit";
import { consumeRecoveryCode, verifyTotp } from "@/server/auth/mfa";
import { createOrganization, ensureAttorneyForMember, findInvitation, findUserByEmail, normalizeEmail } from "@/server/services/accounts";
import { audit } from "@/server/audit";
import { sendEmail } from "@/server/email";
import { config } from "@/server/config";
import { logger } from "@/server/logger";

export type FormState = { error?: string; ok?: string; fields?: Record<string, string> };

const GENERIC_LOGIN_ERROR = "Email or password is incorrect.";
const RATE_LIMITED = "Too many attempts. Please wait a few minutes and try again.";

function safeNext(next: unknown): string {
  const n = typeof next === "string" ? next : "";
  return /^\/(app|admin)(\/|$|\?)/.test(n) && !n.startsWith("//") ? n : "/app";
}
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/* ------------------------------------------------------------------ login */
export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = normalizeEmail(str(fd, "email"));
  const password = String(fd.get("password") ?? "");
  const next = safeNext(fd.get("next"));
  if (!email || !password) return { error: "Enter your email and password.", fields: { email } };

  const ip = await clientIpHash();
  if (!(await rateLimit(`login:ip:${ip}`, 30, 900)) || !(await rateLimit(`login:email:${sha256(email)}`, 8, 900))) {
    return { error: RATE_LIMITED, fields: { email } };
  }
  const user = await findUserByEmail(email);
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok || user.disabledAt || user.isDemoUser) return { error: GENERIC_LOGIN_ERROR, fields: { email } };
  if (!user.emailVerifiedAt) return { error: "Please verify your email address first. Check your inbox for the verification link.", fields: { email } };

  await createSession(user.id, { mfaPending: user.mfaEnabled });
  await systemDb().update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  if (user.mfaEnabled) redirect(`/login/mfa?next=${encodeURIComponent(next)}`);
  const m = (await systemDb().select().from(memberships).where(eq(memberships.userId, user.id)).limit(1))[0];
  await audit(systemDb(), { organizationId: m?.organizationId ?? null, actorUserId: user.id, actorLabel: user.name, action: "auth.signed_in", summary: `${user.name} signed in` });
  redirect(next);
}

export async function mfaAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await getSession();
  if (!s) redirect("/login");
  const code = str(fd, "code");
  const next = safeNext(fd.get("next"));
  if (!(await rateLimit(`mfa:${s.userId}`, 8, 900))) return { error: RATE_LIMITED };
  const user = (await systemDb().select().from(users).where(eq(users.id, s.userId)).limit(1))[0];
  if (!user?.mfaEnabled || !user.mfaSecretEnc) redirect(next);
  let valid = verifyTotp(user.mfaSecretEnc, user.email, code);
  if (!valid && code.includes("-")) {
    const remaining = consumeRecoveryCode(user.mfaRecoveryHashes, code);
    if (remaining) {
      valid = true;
      await systemDb().update(users).set({ mfaRecoveryHashes: remaining }).where(eq(users.id, user.id));
    }
  }
  if (!valid) return { error: "That code is not valid. Codes refresh every 30 seconds." };
  await systemDb().update(sessions).set({ mfaPending: false }).where(eq(sessions.id, s.id));
  await audit(systemDb(), { organizationId: s.activeOrganizationId, actorUserId: user.id, actorLabel: user.name, action: "auth.signed_in", summary: `${user.name} signed in with two-factor authentication` });
  redirect(next);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login?signed_out=1");
}

/* ------------------------------------------------------------------ demo access */
export async function demoLoginAction(_: FormState, fd: FormData): Promise<FormState> {
  if (!config.demoEnabled) return { error: "The demonstration workspace is not available on this deployment." };
  if (config.demoAccessCode && str(fd, "code") !== config.demoAccessCode) return { error: "That access code is not valid." };
  if (!(await rateLimit(`demo:${await clientIpHash()}`, 40, 3600))) return { error: RATE_LIMITED };
  const db = systemDb();
  const demoUser = (await db.select().from(users).where(eq(users.isDemoUser, true)).limit(1))[0];
  const demoOrg = (await db.select().from(organizations).where(eq(organizations.isDemo, true)).limit(1))[0];
  if (!demoUser || !demoOrg) {
    logger.error("demo.not_seeded");
    return { error: "The demonstration workspace has not been set up yet. Run `npm run seed:demo`." };
  }
  await createSession(demoUser.id, { mfaPending: false, activeOrganizationId: demoOrg.id });
  redirect("/app");
}

/* ------------------------------------------------------------------ signup */
const signupSchema = z.object({
  name: z.string().min(2, "Enter your full name.").max(120),
  email: z.email("Enter a valid email address."),
  password: z.string(),
  firm: z.string().max(160).optional(),
});

/**
 * Two cases:
 *  - setup token + allow-listed email: creates a platform administrator (first-run founder setup).
 *  - SIGNUP_MODE=open: creates a user and their own organization; email verification required.
 * Otherwise accounts are created only by accepting an invitation.
 */
export async function signupAction(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({ name: str(fd, "name"), email: str(fd, "email"), password: String(fd.get("password") ?? ""), firm: str(fd, "firm") || undefined });
  const fields = { name: str(fd, "name"), email: str(fd, "email"), firm: str(fd, "firm") };
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form.", fields };
  const email = normalizeEmail(parsed.data.email);
  const setup = str(fd, "setup");
  const isAdminSetup = config.setupTokenMatches(setup) && config.platformAdminEmails.includes(email);
  if (!isAdminSetup && config.setupTokenMatches(setup)) return { error: "This email is not listed in PLATFORM_ADMIN_EMAILS. Use that email, or update the setting in your hosting dashboard and redeploy.", fields };
  if (!isAdminSetup && config.signupMode !== "open") return { error: "Asteric accounts are created by invitation. Request access or ask your administrator for an invite.", fields };
  if (!(await rateLimit(`signup:${await clientIpHash()}`, 10, 3600))) return { error: RATE_LIMITED, fields };
  const pwProblem = passwordProblem(parsed.data.password, email);
  if (pwProblem) return { error: pwProblem, fields };
  if (await findUserByEmail(email)) return { error: "An account with this email already exists. Sign in instead.", fields };
  if (!isAdminSetup && !parsed.data.firm) return { error: "Enter your firm name.", fields };

  const db = systemDb();
  const [user] = await db.insert(users).values({
    email, name: parsed.data.name, passwordHash: await hashPassword(parsed.data.password),
    isPlatformAdmin: isAdminSetup, emailVerifiedAt: isAdminSetup ? new Date() : null,
  }).returning();
  await audit(db, { organizationId: null, actorUserId: user!.id, actorLabel: user!.name, action: isAdminSetup ? "platform.admin_created" : "auth.signed_up", summary: `${user!.name} created an account` });

  if (isAdminSetup) {
    await createSession(user!.id, { mfaPending: false });
    redirect("/admin");
  }
  const org = await createOrganization({ name: parsed.data.firm!, practiceArea: "employment", ownerUserId: user!.id, ownerName: user!.name });
  await ensureAttorneyForMember(db, org.id, user!.id, user!.name);
  const token = newToken();
  await db.insert(authTokens).values({ kind: "email_verify", userId: user!.id, email, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 48 * 3600_000) });
  const link = `${config.appUrl}/verify-email?token=${token}`;
  await sendEmail({ to: email, subject: "Verify your email for Asteric", text: `Confirm your email address to finish creating your Asteric account:\n\n${link}\n\nThis link expires in 48 hours.`, link });
  return { ok: "Account created. We sent a verification link to your email address. Open it to sign in." };
}

/* ------------------------------------------------------------------ password reset */
export async function forgotPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = normalizeEmail(str(fd, "email"));
  const message = "If an account exists for that address, we sent a link to reset the password. It expires in one hour.";
  if (!z.email().safeParse(email).success) return { error: "Enter a valid email address.", fields: { email } };
  if (!(await rateLimit(`reset:${sha256(email)}`, 4, 3600)) || !(await rateLimit(`reset:ip:${await clientIpHash()}`, 20, 3600))) return { ok: message };
  const user = await findUserByEmail(email);
  if (user && !user.isDemoUser && !user.disabledAt) {
    const token = newToken();
    await systemDb().insert(authTokens).values({ kind: "password_reset", userId: user.id, email, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 3600_000) });
    const link = `${config.appUrl}/reset-password?token=${token}`;
    await sendEmail({ to: email, subject: "Reset your Asteric password", text: `A password reset was requested for your Asteric account.\n\nReset your password: ${link}\n\nThis link expires in one hour. If you did not request this, you can ignore this email.`, link });
  }
  return { ok: message };
}

export async function resetPasswordAction(_: FormState, fd: FormData): Promise<FormState> {
  const token = str(fd, "token");
  const password = String(fd.get("password") ?? "");
  const db = systemDb();
  const row = (await db.select().from(authTokens).where(and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.kind, "password_reset"), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date()))).limit(1))[0];
  if (!row?.userId) return { error: "This reset link is invalid or has expired. Request a new one." };
  const problem = passwordProblem(password, row.email);
  if (problem) return { error: problem };
  await db.update(users).set({ passwordHash: await hashPassword(password), emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
  await revokeOtherSessions(row.userId);
  await audit(db, { organizationId: null, actorUserId: row.userId, actorLabel: row.email, action: "auth.password_reset", summary: "Password reset; all sessions signed out" });
  redirect("/login?reset=1");
}

/* ------------------------------------------------------------------ invitations */
export async function acceptInviteAction(_: FormState, fd: FormData): Promise<FormState> {
  const token = str(fd, "token");
  const found = await findInvitation(token);
  if (!found) return { error: "This invitation is invalid, expired or already used." };
  const { inv } = found;
  const db = systemDb();
  let user = await findUserByEmail(inv.email);
  if (user) {
    const s = await getSession();
    if (!s || s.userId !== user.id) return { error: "An account already exists for this email. Sign in with it first, then reopen the invitation link." };
  } else {
    const name = str(fd, "name");
    const password = String(fd.get("password") ?? "");
    if (name.length < 2) return { error: "Enter your full name.", fields: { name } };
    const problem = passwordProblem(password, inv.email);
    if (problem) return { error: problem, fields: { name } };
    [user] = await db.insert(users).values({ email: inv.email, name, title: str(fd, "title") || null, passwordHash: await hashPassword(password), emailVerifiedAt: new Date() }).returning();
  }
  const existing = (await db.select().from(memberships).where(and(eq(memberships.userId, user!.id), eq(memberships.organizationId, inv.organizationId))).limit(1))[0];
  if (!existing) await db.insert(memberships).values({ organizationId: inv.organizationId, userId: user!.id, role: inv.role });
  if (["owner", "admin", "attorney"].includes(inv.role)) await ensureAttorneyForMember(db, inv.organizationId, user!.id, user!.name, user!.title);
  await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
  await audit(db, { organizationId: inv.organizationId, actorUserId: user!.id, actorLabel: user!.name, action: "team.joined", summary: `${user!.name} accepted an invitation as ${inv.role}`, objectType: "user", objectId: user!.id });
  const s = await getSession();
  if (s?.userId === user!.id) await db.update(sessions).set({ activeOrganizationId: inv.organizationId }).where(eq(sessions.id, s.id));
  else await createSession(user!.id, { mfaPending: user!.mfaEnabled, activeOrganizationId: inv.organizationId });
  redirect(user!.mfaEnabled && s?.userId !== user!.id ? "/login/mfa" : "/app");
}

/* ------------------------------------------------------------------ request access / contact */
const requestSchema = z.object({
  name: z.string().min(2, "Enter your name.").max(120),
  email: z.email("Enter a valid work email."),
  firm: z.string().min(2, "Enter your firm or organization.").max(160),
  role: z.string().max(80).optional(),
  firmSize: z.string().max(40).optional(),
  message: z.string().max(2000).optional(),
  kind: z.enum(["access", "contact"]),
});

export async function requestAccessAction(_: FormState, fd: FormData): Promise<FormState> {
  const raw = { name: str(fd, "name"), email: str(fd, "email"), firm: str(fd, "firm"), role: str(fd, "role") || undefined, firmSize: str(fd, "firmSize") || undefined, message: str(fd, "message") || undefined, kind: str(fd, "kind") === "contact" ? "contact" : "access" };
  if (str(fd, "website")) return { ok: "Thank you. We will be in touch." }; // honeypot
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form.", fields: { name: raw.name, email: raw.email, firm: raw.firm, message: raw.message ?? "" } };
  if (!(await rateLimit(`request:${await clientIpHash()}`, 6, 3600))) return { error: RATE_LIMITED };
  await systemDb().insert(accessRequests).values({ ...parsed.data, email: normalizeEmail(parsed.data.email) });
  logger.info("access_request.received", { kind: parsed.data.kind });
  return { ok: parsed.data.kind === "contact" ? "Thank you. Your message has been received and we will reply by email." : "Thank you. Your request has been received. We onboard a small number of design-partner firms at a time and will reply by email." };
}

