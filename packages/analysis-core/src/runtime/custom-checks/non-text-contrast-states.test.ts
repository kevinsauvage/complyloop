import { describe, expect, it } from "vitest";
import { nonTextContrastViolation } from "./non-text-contrast";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("nonTextContrastViolation interactive states", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags a control whose hover border drops below 3:1",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="en"><head><style>
          .ok { border: 2px solid #000; background: #fff; }
          .ok:hover { border-color: #eee; }
        </style></head><body>
          <button class="ok">Save</button>
        </body></html>
      `);
      try {
        const violation = await nonTextContrastViolation(page);
        expect(violation?.id).toBe("non-text-contrast");
        expect(
          violation?.nodes.some((n) => n.failureSummary?.includes("hover")),
        ).toBe(true);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "flags a selected control whose chrome drops below 3:1",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="en"><head><style>
          [aria-pressed="false"] { border: 2px solid #000; background: #fff; }
          [aria-pressed="true"] { border: 2px solid #eee; background: #fff; }
        </style></head><body>
          <button aria-pressed="true">On</button>
        </body></html>
      `);
      try {
        const violation = await nonTextContrastViolation(page);
        expect(violation?.id).toBe("non-text-contrast");
        expect(
          violation?.nodes.some((n) => n.failureSummary?.includes("selected")),
        ).toBe(true);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not fail disabled chrome (WCAG 1.4.11 inactive exception)",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="en"><body>
          <button disabled style="border:2px solid #eee;background:#fff">Off</button>
        </body></html>
      `);
      try {
        const violation = await nonTextContrastViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
