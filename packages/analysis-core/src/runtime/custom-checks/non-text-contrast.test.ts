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
          .ok { border: 2px solid #000; background: #fff; }
          .ok:hover { border-color: #eee; }
        </style></head><body>
          <button class="ok">Save</button>
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
          [aria-pressed="false"] { border: 2px solid #000; background: #fff; }
          [aria-pressed="true"] { border: 2px solid #eee; background: #fff; }
        </style></head><body>
          <button aria-pressed="true">On</button>
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
