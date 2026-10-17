/**
 * Applies pending SQL migrations from ./drizzle. Safe to run on every deploy:
 * a Postgres advisory lock prevents two deploys migrating at once.
 *   npm run db:migrate
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to .env.local (development) or your Vercel project settings.");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(72093451)");
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log("Migrations applied.");
  } finally {
    await client.query("select pg_advisory_unlock(72093451)").catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
