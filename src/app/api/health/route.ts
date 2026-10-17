import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { systemDb } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness and database connectivity. Reveals nothing about configuration or data. */
export async function GET() {
  try {
    await systemDb().execute(sql`select 1`);
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
