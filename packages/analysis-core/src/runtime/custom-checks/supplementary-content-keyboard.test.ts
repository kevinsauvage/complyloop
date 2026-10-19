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

  it.skipIf(!chromiumExecutableAvailable())(
    "ignores a field title that repeats its label",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <label for="e" class="sr-only">Email address</label>
          <input id="e" type="email" title="Email address" placeholder="you@example.com" />
        </body></html>
      `,
        async (page) => {
          expect(await supplementaryContentKeyboardViolation(page)).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "still flags a field title that adds information the label lacks",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <label for="e">Email</label>
          <input id="e" type="email" title="Use the address you ordered with" />
        </body></html>
      `,
        async (page) => {
          expect((await supplementaryContentKeyboardViolation(page))?.id).toBe(
            "supplementary-content-keyboard",
          );
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
