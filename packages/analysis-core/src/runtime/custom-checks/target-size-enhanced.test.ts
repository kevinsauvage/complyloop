import { describe, expect, it } from "vitest";

import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./playwright-page";
import { registerPlaywrightBrowserTeardown } from "./playwright-test-teardown";
import { targetSizeEnhancedViolation } from "./target-size-enhanced";

registerPlaywrightBrowserTeardown();

describe("targetSizeEnhancedViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags a 32×32 control that passes 24×24 AA but fails 44×44 AAA",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><head><style>
          .small { width: 32px; height: 32px; padding: 0; }
          .ok { width: 44px; height: 44px; padding: 0; }
        </style></head><body>
          <button class="small" aria-label="Edit"></button>
          <button class="ok">Save</button>
        </body></html>
      `,
        async (page) => {
          const violation = await targetSizeEnhancedViolation(page);
          expect(violation?.id).toBe("target-size-enhanced");
          expect(violation?.nodes.some((n) => n.html.includes("small"))).toBe(
            true,
          );
          expect(violation?.nodes.some((n) => n.html.includes("ok"))).toBe(
            false,
          );
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes 44×44 controls and skips inline text links",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <p>Read the <a href="/policy">policy</a> for details.</p>
          <button style="width:48px;height:48px;padding:0">OK</button>
        </body></html>
      `,
        async (page) => {
          const violation = await targetSizeEnhancedViolation(page);
          expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
