import { expect, test } from "@playwright/test";

test.describe("organization account", () => {
  test("shows account overview for the seeded workspace", async ({ page }) => {
    await page.goto("/org");
    await expect(
      page.getByRole("heading", { name: "Organization", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Settings for E2E Workspace/)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Account", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("e2e-workspace", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("@e2e-owner", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Early access pilot", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Data lifecycle", { exact: true }),
    ).toBeVisible();
  });

  test("owner can invite a member by GitHub username", async ({ page }) => {
    await page.goto("/org");
    await page.getByRole("button", { name: "Invite member" }).click();
    const dialog = page.getByRole("dialog", {
      name: /Invite by GitHub username/i,
    });
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole("textbox", { name: /GitHub username/i })
      .fill("e2e-invitee");
    await dialog.getByLabel(/^Role$/i).selectOption("viewer");
    await dialog.getByRole("button", { name: /^Invite$/i }).click();

    await expect(
      page.getByText(/Invited @e2e-invitee as viewer/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/e2e-invitee/i).first()).toBeVisible();
  });

  test("owner can export organization JSON", async ({ page }) => {
    await page.goto("/org");
    await page
      .getByRole("button", { name: /Export organization JSON/i })
      .click();
    await expect(
      page.getByRole("heading", { name: /Export organization data/i }),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download JSON/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/complyloop-.*\.json/);

    // Success is toast-only (Sonner toasts carry no role="status"; the
    // inline status element was removed when export moved to announceResult).
    await expect(
      page
        .locator("[data-sonner-toast]")
        .filter({ hasText: /Exported E2E Workspace data as JSON/i }),
    ).toBeVisible();
  });

  test("owner can create and delete a disposable organization", async ({
    page,
  }) => {
    const orgName = `E2E Disposable ${Date.now()}`;

    await page.goto("/org");
    await page.getByRole("button", { name: "New organization" }).click();
    const createDialog = page.getByRole("dialog", {
      name: /Create an organization/i,
    });
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel(/Organization name/i).fill(orgName);
    await createDialog
      .getByRole("button", { name: /Create organization/i })
      .click();

    await expect(
      page
        .getByText(new RegExp(`Created organization "${orgName}"`, "i"))
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.goto("/org");
    await expect(
      page.getByText(new RegExp(`Settings for ${orgName}`)),
    ).toBeVisible();

    await page.getByText("Advanced — show delete controls").click();
    await page.getByRole("button", { name: /^Delete organization$/i }).click();
    await expect(
      page.getByRole("heading", { name: new RegExp(`Delete ${orgName}`, "i") }),
    ).toBeVisible();
    await page.getByLabel(/Confirmation/i).fill("DELETE");
    await page.getByRole("button", { name: /Delete permanently/i }).click();

    await expect(
      page
        .getByText(/Organization deleted\. Evidence history was retained/i)
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // Cookie should fall back to the seeded workspace so later owner tests keep
    // the connected sample project.
    await page.goto("/org");
    await expect(page.getByText(/Settings for E2E Workspace/)).toBeVisible();
  });
});
