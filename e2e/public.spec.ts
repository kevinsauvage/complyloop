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

  test("unsigned organization page requires sign-in", async ({ page }) => {
    await page.goto("/org");
    await expect(
      page.getByRole("heading", { name: /Organization account/i }),
    ).toBeVisible();
    await expect(page.getByText(/Sign in required/i)).toBeVisible();
  });

  test("health endpoint reports ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      database: "up",
    });
  });
});
