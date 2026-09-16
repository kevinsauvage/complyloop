import { expect, test } from "@playwright/test";

const routes: Array<{ path: string; heading: string | RegExp }> = [
  { path: "/dashboard", heading: /sample-app|Welcome to ComplyLoop/i },
  { path: "/requirements", heading: "Requirements" },
  { path: "/findings", heading: "Findings" },
  { path: "/evidence", heading: "Evidence" },
  { path: "/settings", heading: "Settings" },
  { path: "/org", heading: "Organization" },
];

test.describe("authenticated routes", () => {
  for (const route of routes) {
    test(`${route.path} renders`, async ({ page }) => {
      await page.goto(route.path);
      await expect(
        page.getByRole("heading", { name: route.heading }).first(),
      ).toBeVisible();
    });
  }

  test("sidebar navigates between primary sections", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /sample-app|Welcome to ComplyLoop/i }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: /Findings/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/findings/);
    await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: /Evidence/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/evidence/);
    await expect(
      page.getByRole("heading", { name: "Evidence", exact: true }),
    ).toBeVisible();
  });
});
