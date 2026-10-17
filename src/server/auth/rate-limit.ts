import "server-only";
import { sql } from "drizzle-orm";
import { systemDb } from "@/server/db";

/**
 * Fixed-window rate limiter backed by Postgres, so limits hold across serverless
 * instances. Returns true when the request is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const res = await systemDb().execute<{ count: number }>(sql`
    insert into rate_limits (key, count, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) then now() else rate_limits.window_start end
    returning count`);
  return Number(res.rows[0]?.count ?? 0) <= limit;
}
