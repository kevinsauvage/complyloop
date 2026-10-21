import { expect, test } from "@playwright/test";

import { E2E_PROJECT_ID, projectPath } from "./constants";

const routes: Array<{ path: string; heading: string | RegExp }> = [
  { path: projectPath("dashboard"), heading: "Dashboard" },
  { path: projectPath("requirements"), heading: "Requirements" },
  { path: projectPath("findings"), heading: "Findings" },
  { path: projectPath("evidence"), heading: "Evidence" },
  { path: projectPath("settings"), heading: "Settings" },
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

  test("project tabs navigate between project sections", async ({ page }) => {
    await page.goto(projectPath("dashboard"));
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await page
      .getByRole("navigation", { name: "Project" })
      .getByRole("link", { name: /Findings/ })
      .first()
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/projects/${E2E_PROJECT_ID}/findings`),
    );
    await expect(
      page.getByRole("heading", { name: "Findings", exact: true }),
    ).toBeVisible();

    await page
      .getByRole("navigation", { name: "Project" })
      .getByRole("link", { name: /Evidence/ })
      .first()
      .click();
    await expect(page).toHaveURL(
      new RegExp(`/projects/${E2E_PROJECT_ID}/evidence`),
    );
    await expect(
      page.getByRole("heading", { name: "Evidence", exact: true }),
    ).toBeVisible();
  });
});
