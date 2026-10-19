import { expect, test } from "@playwright/test";

test.describe("viewer authorization", () => {
  test("viewer cannot run assessment", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /sample-app|Welcome to ComplyLoop/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Run assessment" }),
    ).toHaveCount(0);
  });

  test("viewer sees view-only notice on a finding", async ({ page }) => {
    await page.goto("/findings");
    // Open whichever finding is listed first: earlier specs run assessments
    // against the fixture, so the seeded img-alt finding is not guaranteed to
    // be on page 1 of the (severity-sorted, paginated) list.
    await page
      .getByRole("list", { name: "Findings" })
      .getByRole("link")
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
      page.getByRole("button", { name: /Save preview URL/i }),
    ).toHaveCount(0);
    await expect(
      page.getByText(/requires an admin or owner role/i).first(),
    ).toBeVisible();
  });

  test("viewer cannot invite, export, or delete the organization", async ({
    page,
  }) => {
    await page.goto("/org");
    await expect(
      page.getByRole("heading", { name: "Organization", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Invite member" }),
    ).toHaveCount(0);
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
