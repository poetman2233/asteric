import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PUBLIC = ["/login", "/request-access", "/security", "/privacy", "/terms"];
const APP = ["/app", "/app/matters", "/app/calibration", "/app/economics", "/app/insights", "/app/watch", "/app/data-quality", "/app/predictions", "/app/imports", "/app/settings/profile"];

async function check(page: import("@playwright/test").Page, path: string) {
  await page.goto(path);
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", ")}`), path).toEqual([]);
}

test("public pages have no serious accessibility violations", async ({ page }) => {
  for (const p of PUBLIC) await check(page, p);
});

test("application pages have no serious accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /demo/i }).first().click();
  await page.waitForURL(/\/app$/);
  for (const p of APP) await check(page, p);
});
