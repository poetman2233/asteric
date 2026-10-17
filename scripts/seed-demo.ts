/**
 * Creates or refreshes the synthetic "Keller & Ross Employment Law" demonstration workspace.
 *   npm run seed:demo                 regenerate all demo data relative to today
 *   npm run demo:reset                remove sandbox predictions only
 * Only the organization flagged is_demo is touched.
 */
import "./load-env";
import { resetDemoSandbox, seedDemo } from "@/server/demo/seed";
import { pool } from "@/server/db";

async function main() {
  const t = Date.now();
  if (process.argv.includes("--reset-sandbox")) {
    const r = await resetDemoSandbox();
    console.log(`Removed ${r.deleted} sandbox predictions.`);
  } else {
    const r = await seedDemo();
    console.log(`Demo workspace ready: ${r.matters} matters, ${r.predictions} predictions, ${r.events} events, ${r.outcomes} outcomes (as of ${r.asOf}) in ${((Date.now() - t) / 1000).toFixed(1)}s.`);
  }
  await pool().end();
}

main().catch((err) => {
  console.error("Demo seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
