import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { config } from "@/server/config";
import { cleanupExpired, purgeDeletedOrganizations } from "@/server/maintenance";
import { seedDemo } from "@/server/demo/seed";
import { logger } from "@/server/logger";

export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = config.cronSecret;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Daily maintenance, called by Vercel Cron with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result: Record<string, unknown> = {};
  try {
    result.purge = await purgeDeletedOrganizations();
    result.cleanup = await cleanupExpired();
    if (config.demoEnabled) result.demo = await seedDemo().then((r) => ({ matters: r.matters, asOf: r.asOf }));
    logger.info("cron.daily", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    logger.error("cron.daily.failed", { err: e, partial: result });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
