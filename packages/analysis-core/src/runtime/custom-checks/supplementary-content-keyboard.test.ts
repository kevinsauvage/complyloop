import { describe, expect, it } from "vitest";

import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";
import { supplementaryContentKeyboardViolation } from "./supplementary-content-keyboard";

registerPlaywrightBrowserTeardown();

describe("supplementaryContentKeyboardViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags title-only tooltips",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <a href="/help" title="Aide détaillée sur cette fonctionnalité">Aide</a>
        </body></html>
      `);
      try {
        const violation = await supplementaryContentKeyboardViolation(page);
        expect(violation?.id).toBe("supplementary-content-keyboard");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
