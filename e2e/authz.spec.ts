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
});
