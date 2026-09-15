import { expect, test } from "@playwright/test";

test.describe("project settings", () => {
  test("shows connected project and runtime audit form", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "e2e/sample-app" }),
    ).toBeVisible();
    await expect(
      page.getByText("Runtime audit", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(/Preview \/ staging URL/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Save preview settings/i }),
    ).toBeVisible();
  });

  test("rejects localhost runtime audit URLs", async ({ page }) => {
    await page.goto("/settings");
    await page
      .getByLabel(/Preview \/ staging URL/i)
      .fill("http://localhost:3000");
    await page.getByRole("button", { name: /Save preview settings/i }).click();

    await expect(
      page
        .getByText(/cannot target localhost, private, or metadata hosts/i)
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // Unsafe value must not be persisted.
    await page.reload();
    await expect(page.getByLabel(/Preview \/ staging URL/i)).toHaveValue("");
  });
});
