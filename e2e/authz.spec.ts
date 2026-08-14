import { expect, test } from "@playwright/test";

test.describe("viewer authorization", () => {
  test("viewer cannot run assessment", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Run assessment" }),
    ).toHaveCount(0);
  });

  test("viewer sees view-only notice on a finding", async ({ page }) => {
    await page.goto("/findings");
    await page
      .getByRole("link", { name: /Images have a text alternative/i })
      .first()
      .click();
    await expect(
      page.getByText(/view-only access|Ask a member or admin/i),
    ).toBeVisible();
  });

  test("viewer cannot configure runtime audit", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Save runtime audit/i }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/requires an admin or owner role/i),
    ).toBeVisible();
  });

  test("viewer cannot invite, export, or delete the organization", async ({
    page,
  }) => {
    await page.goto("/org");
    await expect(
      page.getByRole("heading", { name: /Organization account/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Invite member" })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole("button", { name: /Export organization JSON/i }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /^Delete organization$/i }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/Only owners and admins can invite/i),
    ).toBeVisible();
  });
});
