import "server-only";

/**
 * Central runtime configuration. Every environment variable the server reads is
 * listed here and documented in .env.example. Nothing here is sent to the browser.
 */
function list(v: string | undefined) {
  return (v ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export const config = {
  get appUrl() {
    const raw = (process.env.APP_URL ?? "http://localhost:3000").trim().replace(/\/+$/, "");
    // Tolerate a value entered without the scheme (e.g. "asteric.vercel.app").
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  /** "invite_only" (default): accounts are created through invitations. "open": anyone may create an organization. */
  get signupMode(): "invite_only" | "open" { return process.env.SIGNUP_MODE === "open" ? "open" : "invite_only"; },
  get setupToken() { return process.env.SETUP_TOKEN ?? ""; },
  get platformAdminEmails() { return list(process.env.PLATFORM_ADMIN_EMAILS); },
  get demoEnabled() { return process.env.DEMO_MODE === "enabled"; },
  get demoAccessCode() { return process.env.DEMO_ACCESS_CODE ?? ""; },
  get emailFrom() { return process.env.EMAIL_FROM ?? ""; },
  get resendApiKey() { return process.env.RESEND_API_KEY ?? ""; },
  get emailConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM); },
  get cronSecret() { return process.env.CRON_SECRET ?? ""; },
  get aiProvider(): "none" | "anthropic" { return process.env.AI_PROVIDER === "anthropic" && process.env.ANTHROPIC_API_KEY && process.env.AI_MODEL ? "anthropic" : "none"; },
  get encryptionKey(): Buffer {
    const raw = process.env.APP_ENCRYPTION_KEY;
    if (!raw) throw new Error("APP_ENCRYPTION_KEY is not configured");
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    return key;
  },
};
