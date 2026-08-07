import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("legal terms page", async ({ page }) => {
    await page.goto("/legal/terms");
    await expect(
      page.getByRole("heading", { name: "Terms of Service" }),
    ).toBeVisible();
  });

  test("legal privacy page", async ({ page }) => {
    await page.goto("/legal/privacy");
    await expect(
      page.getByRole("heading", { name: "Privacy Policy" }),
    ).toBeVisible();
  });

  test("unsigned dashboard prompts to connect", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Connect a project").first()).toBeVisible();
    await expect(
      page.getByText(/Connect a repository to get started|Link a GitHub repository/i).first(),
    ).toBeVisible();
  });
});
