import { expect, test } from "@playwright/test";

test.describe("compliance core loop", () => {
  test("assess → approve → implement → verify → evidence", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.getByRole("button", { name: "Run assessment" }).click();
    await expect(page.getByText(/Assessment complete/i)).toBeVisible({
      timeout: 60_000,
    });

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Findings", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();

    const findingLink = page
      .getByRole("link", {
        name: /Images have a text alternative|Buttons have an accessible name|Links have an accessible name/i,
      })
      .first();
    await expect(findingLink).toBeVisible({ timeout: 15_000 });
    await findingLink.click();

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const approve = page.getByRole("button", { name: "Approve remediation" });
    await expect(approve).toBeVisible();
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
    await expect(
      page.getByText(/Fix verified|Manually verified|still detected/i).first(),
    ).toBeVisible({ timeout: 60_000 });

    const stillFailing = await page
      .getByText(/still detected/i)
      .first()
      .isVisible()
      .catch(() => false);
    if (stillFailing) {
      await page
        .getByLabel("Verification note")
        .fill("Verified in Playwright e2e");
      await page.getByRole("button", { name: "Verify manually" }).click();
      await expect(page.getByText(/Manually verified/i)).toBeVisible();
    }

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Evidence", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
    await expect(
      page
        .getByText(/Assessment of|Remediation|Verified|assessment_completed/i)
        .first(),
    ).toBeVisible();
  });
});
