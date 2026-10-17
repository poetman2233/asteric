import "server-only";
import { config } from "@/server/config";
import { logger } from "@/server/logger";

export type EmailResult = { delivered: boolean };

/**
 * Sends transactional email through Resend when RESEND_API_KEY and EMAIL_FROM are set.
 * Without them, nothing is sent: callers show the link to the authorized admin instead,
 * and in development the link is printed to the server console.
 */
export async function sendEmail(msg: { to: string; subject: string; text: string; link?: string }): Promise<EmailResult> {
  if (!config.emailConfigured) {
    if (!config.isProduction && msg.link) logger.info("email.dev_link", { to: msg.to, subject: msg.subject, link: msg.link });
    return { delivered: false };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.emailFrom, to: [msg.to], subject: msg.subject, text: msg.text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      logger.error("email.send_failed", { status: res.status });
      return { delivered: false };
    }
    return { delivered: true };
  } catch (err) {
    logger.error("email.send_error", { err });
    return { delivered: false };
  }
}
