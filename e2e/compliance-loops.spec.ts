import { expect, test } from "@playwright/test";

/**
 * Additional compliance loops beyond assess → remediate → verify
 * (covered in core-loop.spec.ts).
 */
test.describe("compliance loops", () => {
  test("assess → record requirement exception → evidence", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.getByRole("button", { name: "Run assessment" }).click();
    await expect(page.getByText(/Assessment complete/i).first()).toBeVisible({
      timeout: 60_000,
    });

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Requirements", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Requirements" }),
    ).toBeVisible();

    const exceptionTrigger = page.getByRole("button", {
      name: /Record exception \(N\/A/i,
    }).first();
    await expect(exceptionTrigger).toBeVisible({ timeout: 15_000 });
    await exceptionTrigger.click();

    const note = page.getByLabel(/Note \(required/i).first();
    await expect(note).toBeVisible();
    await note.fill("E2E exception: marketing microsite out of scope.");

    await page
      .getByRole("button", { name: "Record exception", exact: true })
      .first()
      .click();

    // Success toast is ephemeral after `refresh()`; assert durable exception UI.
    await expect(
      page.getByText(/marketing microsite out of scope/i).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/Exception:\s*not applicable/i).first(),
    ).toBeVisible();

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Evidence", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
    await expect(
      page
        .getByText(/exception|marketing microsite|requirement_exception/i)
        .first(),
    ).toBeVisible();
  });

  test("dismiss finding → evidence trail retains reason", async ({ page }) => {
    await page.goto("/findings/e2e-finding-img-alt");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.getByText("Dismiss this finding").click();
    await page.getByLabel(/Note \(kept as evidence\)/i).fill(
      "E2E dismiss: false positive in fixture.",
    );
    await page.getByRole("button", { name: "Dismiss finding" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(
      confirm.getByRole("heading", { name: /Dismiss finding/i }),
    ).toBeVisible();
    await confirm.getByRole("button", { name: "Dismiss finding" }).click();

    await expect(page.getByText(/Finding dismissed/i).first()).toBeVisible({
      timeout: 15_000,
    });

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Evidence", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
    await expect(
      page.getByText(/Finding dismissed|finding_dismissed|false_positive/i).first(),
    ).toBeVisible();
  });

  test("HTML compliance report is structured and printable", async ({
    page,
  }) => {
    const response = await page.goto("/evidence/report/html");
    expect(response?.ok()).toBeTruthy();
    await expect(
      page.getByRole("heading", { name: /Compliance report/i }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Requirements" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Findings" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Evidence trail" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Print \/ Save as PDF/i }),
    ).toBeVisible();
  });
});
