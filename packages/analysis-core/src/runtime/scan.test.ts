import { afterAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { resolveAxeMinJsPath, runAxeOnPage } from "./scan";
import fs from "node:fs";

function chromiumExecutableAvailable(): boolean {
  try {
    const executablePath = chromium.executablePath();
    return fs.existsSync(executablePath);
  } catch {
    return false;
  }
}

describe("runAxeOnPage", () => {
  let browser: Browser | null = null;

  afterAll(async () => {
    await browser?.close();
  });

  it("resolves axe.min.js from disk (not a bundled source string)", () => {
    const axePath = resolveAxeMinJsPath();
    expect(axePath.endsWith("axe.min.js")).toBe(true);
    expect(fs.existsSync(axePath)).toBe(true);
    const head = fs.readFileSync(axePath, "utf8").slice(0, 80);
    expect(head).toMatch(/axe/i);
  });

  it.skipIf(!chromiumExecutableAvailable())(
    "injects axe without ReferenceError: module is not defined",
    async () => {
      browser = await chromium.launch({ headless: true });
      const page = await (await browser.newContext()).newPage();
      await page.setContent(
        `<!doctype html><html lang="en"><head><title>t</title></head><body><img src="x"></body></html>`,
      );
      const results = await runAxeOnPage(page);
      expect(results.violations.some((v) => v.id === "image-alt")).toBe(true);
      expect(Array.isArray(results.incomplete)).toBe(true);
    },
    30_000,
  );
});
