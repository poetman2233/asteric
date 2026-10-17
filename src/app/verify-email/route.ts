import { NextResponse, type NextRequest } from "next/server";
import { and, eq, gt, isNull } from "drizzle-orm";
import { systemDb } from "@/server/db";
import { authTokens, users } from "@/server/db/schema";
import { sha256 } from "@/server/auth/crypto";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const db = systemDb();
  const row = (await db.select().from(authTokens).where(and(eq(authTokens.tokenHash, sha256(token)), eq(authTokens.kind, "email_verify"), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date()))).limit(1))[0];
  const url = req.nextUrl.clone();
  url.search = "";
  if (!row?.userId) {
    url.pathname = "/login";
    url.searchParams.set("expired", "1");
    return NextResponse.redirect(url);
  }
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
  url.pathname = "/login";
  url.searchParams.set("verified", "1");
  return NextResponse.redirect(url);
}
