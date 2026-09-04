import { describe, expect, it } from "vitest";
import { dialogFocusViolations } from "./dialog-focus";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("dialogFocusViolations", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags a modal that does not move focus in",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <button id="open" data-open="d">Open</button>
          <div id="d" role="dialog" aria-modal="true" data-trigger="#open">
            <button id="inside">Inside</button>
          </div>
        </body></html>
      `);
      try {
        await page.focus("#open");
        const violations = await dialogFocusViolations(page);
        expect(violations.some((v) => v.id === "dialog-keyboard")).toBe(
          true,
        );
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
