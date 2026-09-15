import { expect, test } from "@playwright/test";

test("authenticated user can open demo Evidence Vault", async ({ page }) => {
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!password, "E2E_ADMIN_PASSWORD is required for authenticated workflow tests");
  await page.goto("/login");
  await page.getByLabel(/username/i).fill("admin");
  await page.getByLabel(/password/i).fill(password!);
  await page.getByRole("button", { name: /access system/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await page.goto("/evidence/INC-MOCK-SUPERTL");
  await expect(page.getByRole("heading", { name: /evidence vault/i })).toBeVisible();
  await expect(page.getByText(/demo-collection-manifest/i)).toBeVisible();
  await page.getByLabel(/view demo-collection-manifest/i).click();
  await expect(page.getByRole("dialog", { name: /evidence details/i })).toBeVisible();
});
