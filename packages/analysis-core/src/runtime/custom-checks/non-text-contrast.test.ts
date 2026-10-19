import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  nonTextContrastViolation,
  parseRgb,
  relativeLuminance,
} from "./non-text-contrast";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./playwright-page";
import { registerPlaywrightBrowserTeardown } from "./playwright-test-teardown";

registerPlaywrightBrowserTeardown();

describe("parseRgb", () => {
  it("parses rgb and rgba strings", () => {
    expect(parseRgb("rgb(0, 0, 0)")).toEqual([0, 0, 0]);
    expect(parseRgb("rgba(255, 255, 255, 0.5)")).toEqual([255, 255, 255]);
  });

  it("returns null for non-rgb values", () => {
    expect(parseRgb("transparent")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("returns 21:1 for black on white", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
  });

  it("is symmetric", () => {
    const a: [number, number, number] = [120, 120, 120];
    const b: [number, number, number] = [200, 200, 200];
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 5);
  });
});

describe("relativeLuminance", () => {
  it("ranks white higher than black", () => {
    expect(relativeLuminance([255, 255, 255])).toBeGreaterThan(
      relativeLuminance([0, 0, 0]),
    );
  });
});

describe("nonTextContrastViolation interactive states", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags a control whose hover border drops below 3:1",
    async () => {
      const violation = await withProbePage(
        `
        <!doctype html><html lang="en"><head><style>
          .ok { border: 2px solid #000; background: #fff; width: 40px; height: 40px; }
          .ok:hover { border-color: #eee; }
        </style></head><body>
          <button class="ok" aria-label="Save"></button>
        </body></html>
      `,
        (page) => nonTextContrastViolation(page),
      );
      expect(violation?.id).toBe("non-text-contrast");
      expect(
        violation?.nodes.some((n) => n.failureSummary?.includes("hover")),
      ).toBe(true);
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "flags a selected control whose chrome drops below 3:1",
    async () => {
      const violation = await withProbePage(
        `
        <!doctype html><html lang="en"><head><style>
          [aria-pressed="false"] { border: 2px solid #000; background: #fff; width: 40px; height: 40px; }
          [aria-pressed="true"] { border: 2px solid #eee; background: #fff; width: 40px; height: 40px; }
        </style></head><body>
          <button aria-pressed="true" aria-label="On"></button>
        </body></html>
      `,
        (page) => nonTextContrastViolation(page),
      );
      expect(violation?.id).toBe("non-text-contrast");
      expect(
        violation?.nodes.some((n) => n.failureSummary?.includes("selected")),
      ).toBe(true);
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not fail a quiet border when visible text identifies the control",
    async () => {
      const violation = await withProbePage(
        `
        <!doctype html><html lang="en"><body style="background:#09090b">
          <a href="#x" style="display:inline-block;padding:8px 16px;color:#e4e4e7;border:1px solid #3f3f46">Read more</a>
        </body></html>
      `,
        (page) => nonTextContrastViolation(page),
      );
      expect(violation).toBeNull();
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not fail a quiet border around an icon-only control",
    async () => {
      const violation = await withProbePage(
        `
        <!doctype html><html lang="en"><body style="background:#09090b">
          <button aria-label="Next" style="width:44px;height:44px;color:#e4e4e7;border:1px solid #3f3f46">
            <svg width="20" height="20" viewBox="0 0 20 20"><path d="M5 5l10 5-10 5z" fill="currentColor"/></svg>
          </button>
        </body></html>
      `,
        (page) => nonTextContrastViolation(page),
      );
      expect(violation).toBeNull();
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "still fails when the identifying text is itself below 3:1",
    async () => {
      const violation = await withProbePage(
        `
        <!doctype html><html lang="en"><body style="background:#fff">
          <button style="color:#eee;border:2px solid #eee;background:#fff">Hidden label</button>
        </body></html>
      `,
        (page) => nonTextContrastViolation(page),
      );
      expect(violation?.id).toBe("non-text-contrast");
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not fail disabled chrome (WCAG 1.4.11 inactive exception)",
    async () => {
      const violation = await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <button disabled style="border:2px solid #eee;background:#fff">Off</button>
        </body></html>
      `,
        (page) => nonTextContrastViolation(page),
      );
      expect(violation).toBeNull();
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
