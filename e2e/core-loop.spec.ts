import { expect, test } from "@playwright/test";

test.describe("compliance core loop", () => {
  test("assess → finding → evidence", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /sample-app|Welcome to ComplyLoop/i }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Run assessment" }).click();
    // Success is toast-only (not inline under the form).
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /Assessment complete/i }),
    ).toBeVisible({ timeout: 60_000 });

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: /Findings/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Findings", exact: true }),
    ).toBeVisible();

    const findingLink = page
      .getByRole("link", {
        name: /Images have a text alternative|Buttons have an accessible name|Links have an accessible name/i,
      })
      .first();
    await expect(findingLink).toBeVisible({ timeout: 15_000 });
    await findingLink.click();

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const approve = page.getByRole("button", {
      name: /^Approve$|Approve remediation/,
    });
    if (await approve.isVisible()) {
      await approve.click();
      await expect(page.getByText(/Remediation approved/i)).toBeVisible();

      const markImplemented = page.getByRole("button", {
        name: "Mark as implemented",
      });
      await expect(markImplemented).toBeVisible();
      await page
        .getByLabel(/mark implemented/i)
        .fill("Applied in e2e fixture verify path");
      await markImplemented.click();
      await expect(page.getByText(/Marked as implemented/i)).toBeVisible();

      const verify = page.getByRole("button", {
        name: "Verify fix (automated re-check)",
      });
      await expect(verify).toBeVisible();
      await verify.click();
      // sample-app/Bad.tsx still contains the violation, and localhost
      // previews are SSRF-blocked. A successful verify is unit-tested;
      // this harness must not treat "still detected" as closing the loop.
      await expect(
        page.getByText(/Still failing|still detected/i).first(),
      ).toBeVisible({ timeout: 60_000 });
    }

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: /Evidence/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Evidence", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/Assessment of|assessment_completed/i).first(),
    ).toBeVisible();
  });
});
