import { describe, expect, it } from "vitest";
import { targetSizeEnhancedViolation } from "./target-size-enhanced";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("targetSizeEnhancedViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags a 32×32 control that passes 24×24 AA but fails 44×44 AAA",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="en"><head><style>
          .small { width: 32px; height: 32px; padding: 0; }
          .ok { width: 44px; height: 44px; padding: 0; }
        </style></head><body>
          <button class="small" aria-label="Edit"></button>
          <button class="ok">Save</button>
        </body></html>
      `);
      try {
        const violation = await targetSizeEnhancedViolation(page);
        expect(violation?.id).toBe("complyloop-target-size-enhanced");
        expect(violation?.nodes.some((n) => n.html.includes("small"))).toBe(
          true,
        );
        expect(violation?.nodes.some((n) => n.html.includes("ok"))).toBe(false);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes 44×44 controls and skips inline text links",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="en"><body>
          <p>Read the <a href="/policy">policy</a> for details.</p>
          <button style="width:48px;height:48px;padding:0">OK</button>
        </body></html>
      `);
      try {
        const violation = await targetSizeEnhancedViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
