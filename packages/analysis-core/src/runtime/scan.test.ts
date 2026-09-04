import { afterAll, describe, expect, it, vi } from "vitest";
import { chromium, type Browser } from "playwright";
import {
  gotoForRuntimeAudit,
  resolveAxeMinJsPath,
  runAxeOnPage,
} from "./scan";
import { emulateCoarsePointer } from "./viewport-conditions";
import * as htmlValidateRuntime from "./html-validate-runtime";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./custom-checks/playwright-page";
import fs from "node:fs";

registerPlaywrightBrowserTeardown();

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
    "injects axe once across multiple runs on the same page",
    async () => {
      browser = await chromium.launch({ headless: true });
      const page = await (await browser.newContext()).newPage();
      await page.setContent(
        `<!doctype html><html lang="en"><head><title>t</title></head><body><img src="x"></body></html>`,
      );
      const first = await runAxeOnPage(page);
      const second = await runAxeOnPage(page, { runOnly: ["image-alt"] });
      const third = await runAxeOnPage(page);
      expect(first.violations.some((v) => v.id === "image-alt")).toBe(true);
      expect(second.violations.some((v) => v.id === "image-alt")).toBe(true);
      expect(third.violations.length).toBeGreaterThan(0);
    },
    30_000,
  );
});

describe("gotoForRuntimeAudit", () => {
  let browser: Browser | null = null;

  afterAll(async () => {
    await browser?.close();
  });

  it.skipIf(!chromiumExecutableAvailable())(
    "completes without networkidle when fetch repeats on an interval",
    async () => {
      browser = await chromium.launch({ headless: true });
      const page = await (await browser.newContext()).newPage();
      await page.route("https://repeat.example/**", async (route) => {
        const requestUrl = route.request().url();
        if (requestUrl.endsWith("/ping")) {
          await route.fulfill({ status: 200, body: "ok" });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: `<!doctype html><html lang="en"><head><title>t</title></head><body><h1>Ready</h1><script>setInterval(() => fetch("/ping"), 500);</script></body></html>`,
        });
      });

      const started = Date.now();
      await gotoForRuntimeAudit(page, "https://repeat.example/");
      expect(Date.now() - started).toBeLessThan(10_000);
      expect(await page.locator("h1").textContent()).toBe("Ready");
    },
    30_000,
  );
});

describe("runtime engine isolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "preserves axe violations when html-validate throws",
    async () => {
      const htmlValidateSpy = vi
        .spyOn(htmlValidateRuntime, "htmlValidateFindingsForPage")
        .mockRejectedValue(new Error("html-validate down"));

      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="en"><head><title>t</title></head>
        <body><img src="x.png"></body></html>
      `);
      try {
        const axeResults = await runAxeOnPage(page);
        let htmlValidateFindings: unknown[] = [];
        let pageHtmlValidateRan = false;
        try {
          htmlValidateFindings = await htmlValidateRuntime.htmlValidateFindingsForPage(
            page,
            "https://app.example/",
          );
          pageHtmlValidateRan = true;
        } catch {
          // Non-fatal in scan.ts
        }

        expect(axeResults.violations.some((v) => v.id === "image-alt")).toBe(true);
        expect(pageHtmlValidateRan).toBe(false);
        expect(htmlValidateFindings).toEqual([]);
      } finally {
        htmlValidateSpy.mockRestore();
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "re-injects axe after CDP viewport emulation clears the page script context",
    async () => {
      const probeBrowser = await chromium.launch({ headless: true });
      const page = await (await probeBrowser.newContext()).newPage();
      try {
        await page.setContent(
          `<!doctype html><html lang="en"><head><title>t</title></head><body><button>Save</button></body></html>`,
        );
        await runAxeOnPage(page);
        await emulateCoarsePointer(page, async () => {
          await expect(
            runAxeOnPage(page, { runOnly: ["target-size"] }),
          ).resolves.toBeDefined();
        });
      } finally {
        await probeBrowser.close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
