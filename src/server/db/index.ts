import "server-only";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { logger } from "@/server/logger";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

declare global {
  // eslint-disable-next-line no-var
  var __astericPool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");
  return new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 20_000,
  });
}

/** Lazily created so builds do not need a database. Reused across hot reloads in dev. */
export function pool(): Pool {
  if (!globalThis.__astericPool) globalThis.__astericPool = createPool();
  return globalThis.__astericPool;
}

let _db: Db | undefined;
/**
 * System database handle. Use ONLY for platform-level operations that are not
 * tenant data (auth, sessions, rate limits, platform admin, migrations, seeding).
 * All customer data access must go through `withTenant`.
 */
export function systemDb(): Db {
  if (!_db) _db = drizzle(pool(), { schema, casing: "snake_case" });
  return _db;
}

const TENANT_ROLE = process.env.DB_TENANT_ROLE ?? "asteric_app";
let tenantRoleAvailable: boolean | undefined;

async function checkTenantRole(): Promise<boolean> {
  if (tenantRoleAvailable !== undefined) return tenantRoleAvailable;
  const res = await systemDb().execute(
    sql`select 1 from pg_roles where rolname = ${TENANT_ROLE} and pg_has_role(current_user, ${TENANT_ROLE}, 'MEMBER')`,
  );
  tenantRoleAvailable = res.rows.length > 0;
  if (!tenantRoleAvailable) {
    logger.warn("db.rls_inactive", { role: TENANT_ROLE, detail: "tenant role unavailable; application-level scoping only" });
  }
  return tenantRoleAvailable;
}

export async function rlsStatus() {
  return { role: TENANT_ROLE, active: await checkTenantRole() };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run `fn` inside a transaction bound to one organization.
 * Row-Level Security restricts every statement to `orgId`; the caller must still
 * pass `orgId` explicitly in queries (defence in depth, and clearer code).
 * `orgId` must come from the authenticated session, never from request input.
 */
export async function withTenant<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(orgId)) throw new Error("withTenant: invalid organization id");
  const useRole = await checkTenantRole();
  return systemDb().transaction(async (tx) => {
    if (useRole) await tx.execute(sql.raw(`set local role ${TENANT_ROLE}`));
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}

export { schema };
