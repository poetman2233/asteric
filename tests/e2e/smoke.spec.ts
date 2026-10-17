import { expect, test } from "@playwright/test";

test("landing page and public pages render", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Asteric/);
  await expect(page.getByRole("link", { name: "Log in" }).first()).toBeVisible();
  for (const path of ["/security", "/privacy", "/terms", "/request-access"]) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
  }
  const body = await (await page.goto("/security"))!.text();
  expect(body).not.toMatch(/SOC 2 (certified|compliant)/i);
});

test("the application requires sign-in", async ({ page }) => {
  await page.goto("/app/matters");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fmatters/);
});

test("demo visitor can explore the synthetic workspace", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /demo/i }).first().click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByText("Illustrative demo organization")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Portfolio overview" })).toBeVisible();

  await page.goto("/app/matters?q=KR-1182");
  await page.getByRole("link", { name: "Okonkwo v. Meridian Logistics" }).click();
  await expect(page.getByText("Revision v2")).toBeVisible();
  await expect(page.getByText("$475,000").first()).toBeVisible();

  for (const path of ["/app/calibration", "/app/economics", "/app/insights", "/app/watch", "/app/data-quality", "/app/network", "/app/predictions", "/app/imports"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
  }
  await expect((await page.request.get("/app/export/matters")).status()).toBe(403);
});
