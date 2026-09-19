import fs from "node:fs";

import { type Browser, chromium, type Page } from "playwright-core";
import { afterAll, describe, expect, it, vi } from "vitest";

import type { RawFinding } from "../types";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./custom-checks/playwright-page";
import * as htmlValidateRuntime from "./html-validate-runtime";
import {
  gotoForRuntimeAudit,
  runtimePageMatchesAuditedUrl,
} from "./runtime-navigation";
import {
  resolveAxeMinJsPath,
  runAxeOnPage,
  type RuntimePageScanner,
  runtimeViolationStillPresent,
} from "./scan";
import { emulateCoarsePointer } from "./viewport-conditions";

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

  it("continues when injection throws but axe landed (CSP race noise)", async () => {
    // Models Playwright's `_raceWithCSPError`: a third-party beacon blocked
    // by the page's own CSP rejects addScriptTag even though the script
    // appended fine. The presence re-check distinguishes noise from failure.
    // Present-check calls pass a single arg; the axe.run call passes two.
    let presentCalls = 0;
    let injections = 0;
    const page = {
      evaluate: async (...args: unknown[]) => {
        if (args.length === 1) {
          presentCalls++;
          return presentCalls >= 2;
        }
        return { violations: [], incomplete: [] };
      },
      addScriptTag: async () => {
        injections++;
        throw new Error(
          "page.addScriptTag: Connecting to 'https://tracker.example.com/api/send' violates the following Content Security Policy directive: \"connect-src 'self'\". The action has been blocked.",
        );
      },
    } as unknown as Page;
    const result = await runAxeOnPage(page);
    expect(result.violations).toEqual([]);
    expect(injections).toBe(1);
  });

  it("fails closed with a CSP message when injection never lands", async () => {
    let injections = 0;
    const page = {
      evaluate: async (...args: unknown[]) => {
        if (args.length === 1) return false;
        return { violations: [], incomplete: [] };
      },
      addScriptTag: async () => {
        injections++;
        throw new Error(
          "page.addScriptTag: Refused to execute inline script because it violates the following Content Security Policy directive: \"script-src 'self'\".",
        );
      },
    } as unknown as Page;
    await expect(runAxeOnPage(page)).rejects.toThrow(/Content Security Policy/);
    expect(injections).toBe(3);
  });

  it.skipIf(!chromiumExecutableAvailable())(
    "survives third-party CSP beacon noise during axe injection",
    async () => {
      if (!browser) browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        // The page beacons cross-origin on an interval; connect-src blocks
        // every beacon, so CSP console errors race axe injection — the exact
        // production incident. Inline scripts stay allowed, so injection
        // genuinely lands and the scan must proceed either way the race goes.
        await page.route("https://noisy.example/**", async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "text/html",
            body: `<!doctype html><html lang="en"><head><title>t</title><meta http-equiv="Content-Security-Policy" content="connect-src 'self'"></head><body><img src="x"><script>setInterval(() => { fetch("https://tracker.example/beacon").catch(() => {}); }, 10);</script></body></html>`,
          });
        });
        await page.route("https://tracker.example/**", async (route) => {
          await route.fulfill({ status: 204, body: "" });
        });
        await page.goto("https://noisy.example/");
        const result = await runAxeOnPage(page);
        expect(result.violations.some((v) => v.id === "image-alt")).toBe(true);
      } finally {
        await context.close();
      }
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
      const freeze = await page.evaluate(() =>
        [...document.querySelectorAll("style")].some((el) =>
          (el.textContent ?? "").includes("animation: none"),
        ),
      );
      expect(freeze).toBe(true);
    },
    30_000,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "fails closed on HTTP 404",
    async () => {
      if (!browser) browser = await chromium.launch({ headless: true });
      const page = await (await browser.newContext()).newPage();
      try {
        await page.route("https://missing.example/**", async (route) => {
          await route.fulfill({
            status: 404,
            contentType: "text/html",
            body: `<!doctype html><html lang="en"><head><title>Not found</title></head><body><p>Missing</p></body></html>`,
          });
        });
        await expect(
          gotoForRuntimeAudit(page, "https://missing.example/gone"),
        ).rejects.toThrow(/HTTP 404/);
      } finally {
        await page.context().close();
      }
    },
    30_000,
  );
});

describe("runtimePageMatchesAuditedUrl", () => {
  it("matches origin and pathname, ignoring trailing slashes and query", () => {
    expect(
      runtimePageMatchesAuditedUrl(
        "https://8.8.8.8/checkout/",
        "https://8.8.8.8/checkout?x=1",
      ),
    ).toBe(true);
  });

  it("rejects a login-wall redirect", () => {
    expect(
      runtimePageMatchesAuditedUrl(
        "https://8.8.8.8/login",
        "https://8.8.8.8/checkout",
      ),
    ).toBe(false);
  });
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
          htmlValidateFindings =
            await htmlValidateRuntime.htmlValidateFindingsForPage(
              page,
              "https://app.example/",
            );
          pageHtmlValidateRan = true;
        } catch {
          // Non-fatal in scan.ts
        }

        expect(axeResults.violations.some((v) => v.id === "image-alt")).toBe(
          true,
        );
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

describe("runtimeViolationStillPresent", () => {
  const domFinding = {
    checkId: "color-contrast" as const,
    location: {
      kind: "dom" as const,
      // Literal public IP: passes the SSRF hostname check and skips DNS in tests.
      url: "https://8.8.8.8/checkout",
      selector: "#total",
      snippet: '<button id="total">Total</button>',
    },
  };

  const presentFinding: RawFinding = {
    checkId: "color-contrast",
    kind: "violation",
    severity: "serious",
    confidence: "high",
    reason: "Low contrast on the total button",
    location: domFinding.location,
    fix: null,
    analyzerId: "playwright-custom",
  };

  function pageWith(
    findings: RawFinding[],
    extras: { loadedCleanly?: boolean; finalUrl?: string; url?: string } = {},
  ): RuntimePageScanner {
    return async () => ({
      pages: [
        {
          url: extras.url ?? "https://8.8.8.8/checkout",
          violations: [],
          customFindings: findings,
          loadedCleanly: extras.loadedCleanly,
          finalUrl: extras.finalUrl,
        },
      ],
      pageFailures: [],
    });
  }

  it("returns true when the same violation is still present", async () => {
    await expect(
      runtimeViolationStillPresent(
        domFinding,
        pageWith([presentFinding], { loadedCleanly: true }),
      ),
    ).resolves.toBe(true);
  });

  it("fails closed when a page is returned without proof it loaded cleanly", async () => {
    await expect(
      runtimeViolationStillPresent(domFinding, pageWith([])),
    ).resolves.toBe(true);
  });

  it("returns false when the violating node is gone from a cleanly loaded page", async () => {
    await expect(
      runtimeViolationStillPresent(domFinding, async () => ({
        pages: [
          {
            url: "https://8.8.8.8/checkout",
            violations: [],
            customFindings: [],
            loadedCleanly: true,
          },
        ],
        pageFailures: [],
      })),
    ).resolves.toBe(false);
  });

  it("fails closed when the loaded URL is not the audited page", async () => {
    await expect(
      runtimeViolationStillPresent(domFinding, async () => ({
        pages: [
          {
            url: "https://8.8.8.8/login",
            violations: [],
            customFindings: [],
            loadedCleanly: true,
            finalUrl: "https://8.8.8.8/login",
          },
        ],
        pageFailures: [],
      })),
    ).resolves.toBe(true);
  });

  it("fails closed (true) when no page is produced", async () => {
    await expect(
      runtimeViolationStillPresent(domFinding, async () => ({
        pages: [],
        pageFailures: [],
      })),
    ).resolves.toBe(true);
  });

  it("fails closed (true) when the scan throws (unreachable preview)", async () => {
    await expect(
      runtimeViolationStillPresent(domFinding, async () => {
        throw new Error("preview url unreachable");
      }),
    ).resolves.toBe(true);
  });

  it("throws for a non-DOM finding instead of under-verifying", async () => {
    await expect(
      runtimeViolationStillPresent(
        {
          checkId: "color-contrast",
          location: {
            kind: "source",
            filePath: "src/Checkout.tsx",
            line: 3,
            column: 1,
            snippet: "<button>Total</button>",
            span: { start: 0, end: 21 },
          },
        },
        pageWith([]),
      ),
    ).rejects.toThrow(/DOM location/);
  });
});
