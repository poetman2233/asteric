/**
 * Runs the same maintenance as the daily cron: purges organizations past their 30-day
 * deletion grace period and removes expired sessions and tokens.
 *   npm run org:purge
 */
import "./load-env";
import { cleanupExpired, purgeDeletedOrganizations } from "@/server/maintenance";
import { pool } from "@/server/db";

async function main() {
  console.log(await purgeDeletedOrganizations());
  console.log(await cleanupExpired());
  await pool().end();
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
