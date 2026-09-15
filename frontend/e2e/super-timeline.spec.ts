import { expect, test } from "@playwright/test";

test("demo timeline search, detail collapse, annotations, correlation and export", async ({ page }) => {
  test.setTimeout(90_000);
  test.skip(!process.env.E2E_ADMIN_PASSWORD, "Requires seeded disposable acceptance stack");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => {
    if (response.url().includes("/api/v1/") && response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto("/login");
  await page.getByLabel(/username/i).fill("admin");
  await page.getByLabel(/password/i).fill(process.env.E2E_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: /access system/i }).click();
  await page.waitForURL(/\/dashboard/);

  const redirect = await page.request.get("/api/v1/incidents", { maxRedirects: 0 });
  expect(redirect.status()).toBe(307);
  expect(new URL(redirect.headers().location).origin).toBe(new URL(page.url()).origin);

  await page.goto("/incidents/INC-MOCK-SUPERTL/super-timeline");
  const search = page.getByPlaceholder("Search by host, user, eid, rule, or phrase...");
  await expect(search).toBeVisible();
  await expect(page.getByText("ANNOTATIONS SAVED TO INCIDENT", { exact: false })).toBeVisible();
  const filtered = page.waitForResponse(response => response.url().includes("/evidence/super-timeline/INC-MOCK-SUPERTL?") && new URL(response.url()).searchParams.get("q") === "eid:4624");
  await search.fill("eid:4624");
  const response = await filtered;
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  expect(result.total).toBeGreaterThan(0);
  expect(result.histogram.reduce((count: number, bucket: { count: number }) => count + bucket.count, 0)).toBe(result.total);
  const row = page.getByRole("table").getByRole("row").nth(1);
  await page.locator("main").evaluate(element => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.click();
  await expect(page.getByText("EVENT INSPECTOR", { exact: true })).toBeVisible();
  const collapse = page.getByRole("button", { name: "Collapse event details" });
  await expect(collapse).toBeEnabled();
  await page.locator("main").evaluate(element => element.scrollTo({ top: 0, behavior: "instant" }));
  await collapse.click();
  await page.getByRole("button", { name: "Expand event details" }).click();

  // Each project can run repeatedly against the same disposable seed.
  const remove = page.getByRole("button", { name: "REMOVE FROM BOOKMARKS", exact: true });
  if (await remove.isVisible()) {
    const saved = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().includes("/annotations/"));
    await remove.click();
    expect((await saved).ok()).toBeTruthy();
  }
  const note = `Acceptance ${test.info().project.name}`;
  await page.getByPlaceholder("Add investigative context or hypothesis...").fill(note);
  const saved = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().includes("/annotations/"));
  await page.getByRole("button", { name: "ADD TO INVESTIGATION", exact: true }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(remove).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /BOOKMARKS \(/ }).click();
  await expect(page.getByText(`NOTE: ${note}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /BOOKMARKS \(/ }).click();

  await page.getByText("MULTI-EVENT CORRELATIONS", { exact: true }).click();
  await page.getByRole("button", { name: "RUN CORRELATION" }).click();
  await expect(page.getByText(/Examined .* relevant event candidates/)).toBeVisible();
  await page.getByText("MULTI-EVENT CORRELATIONS", { exact: true }).click();
  await page.getByLabel("Export format").selectOption("jsonl");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "EXPORT JSONL", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.jsonl$/);
  expect(errors).toEqual([]);
});
