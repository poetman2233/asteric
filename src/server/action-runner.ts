import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AuthError } from "@/server/auth/session";
import { LedgerError } from "@/server/services/ledger";
import { ImportFileError } from "@/server/imports/file";
import { logger } from "@/server/logger";

export type ActionResult = { ok?: string; error?: string; id?: string; data?: Record<string, unknown> };

/** User-facing error, shown verbatim. */
export class UserError extends Error {}

/** Uniform error handling: users see a clear message; details go to the server log only. */
export async function run(name: string, fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    return (await fn()) ?? { ok: "Saved." };
  } catch (e) {
    unstable_rethrow(e); // let Next.js redirects and not-found signals through
    if (e instanceof AuthError) {
      if (e.code === "unauthenticated") return { error: "Your session has expired. Sign in again to continue." };
      return { error: e.code === "forbidden" ? e.message || "Your role does not permit this action." : "You do not have access to an organization." };
    }
    if (e instanceof LedgerError || e instanceof ImportFileError || e instanceof UserError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the values entered." };
    logger.error(`action.${name}.failed`, { err: e });
    return { error: "Something went wrong and the change was not saved. The error has been logged; please try again." };
  }
}
