import { describe, expect, it } from "vitest";

import { captchaAlternativeViolation } from "./captcha-alternative";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./playwright-page";
import { registerPlaywrightBrowserTeardown } from "./playwright-test-teardown";

registerPlaywrightBrowserTeardown();

describe("captchaAlternativeViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags captcha without audio fallback",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <div class="g-recaptcha" data-sitekey="x"></div>
        </body></html>
      `,
        async (page) => {
          const violation = await captchaAlternativeViolation(page);
          expect(violation?.id).toBe("captcha-alternative");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
