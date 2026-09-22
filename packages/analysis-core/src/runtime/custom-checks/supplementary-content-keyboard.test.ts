import { describe, expect, it } from "vitest";

import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./playwright-page";
import { registerPlaywrightBrowserTeardown } from "./playwright-test-teardown";
import { supplementaryContentKeyboardViolation } from "./supplementary-content-keyboard";

registerPlaywrightBrowserTeardown();

describe("supplementaryContentKeyboardViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags title-only tooltips",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <a href="/help" title="Aide détaillée sur cette fonctionnalité">Aide</a>
        </body></html>
      `,
        async (page) => {
          const violation = await supplementaryContentKeyboardViolation(page);
          expect(violation?.id).toBe("supplementary-content-keyboard");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
