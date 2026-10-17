import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

/** Applies migrations to the test database once per run. Unit tests do not need it but it is cheap. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://asteric:asteric_dev@localhost:5432/asteric_test";
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } catch (err) {
    console.warn("[tests] Could not migrate the test database; integration tests will fail.", (err as Error).message);
  } finally {
    await pool.end();
  }
}
