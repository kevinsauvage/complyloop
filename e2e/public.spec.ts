import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("landing page renders hero and primary CTA", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: /From RGAA requirement to verified code/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Get started free" }),
    ).toBeVisible();
  });

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

  test("unsigned user is redirected from dashboard to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: "Sign in to ComplyLoop" }),
    ).toBeVisible();
  });

  test("unsigned organization page redirects to login", async ({ page }) => {
    await page.goto("/org");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByRole("heading", { name: "Sign in to ComplyLoop" }),
    ).toBeVisible();
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
