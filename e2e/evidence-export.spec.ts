import fs from "node:fs/promises";

import { expect, test } from "@playwright/test";

test.describe("evidence export", () => {
  test("downloads evidence JSON from the export menu", async ({ page }) => {
    await page.goto("/evidence");
    await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();

    await page.getByRole("button", { name: /^Export/i }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: /Export JSON/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("evidence.json");

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const json = JSON.parse(await fs.readFile(filePath!, "utf8")) as {
      project?: { name?: string };
      evidence?: unknown[];
    };
    expect(json.project?.name).toBe("sample-app");
    expect(Array.isArray(json.evidence)).toBe(true);
  });

  test("serves a Markdown compliance report", async ({ page }) => {
    const response = await page.request.get("/evidence/report");
    expect(response.ok()).toBeTruthy();
    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/markdown|text\/plain|octet-stream/i);
    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/sample-app|Compliance|Evidence|Requirement/i);
  });
});
