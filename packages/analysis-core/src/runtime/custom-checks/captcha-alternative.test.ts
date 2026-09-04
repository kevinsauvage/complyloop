import { describe, expect, it } from "vitest";
import { captchaAlternativeViolation } from "./captcha-alternative";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("captchaAlternativeViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags captcha without audio fallback",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <div class="g-recaptcha" data-sitekey="x"></div>
        </body></html>
      `);
      try {
        const violation = await captchaAlternativeViolation(page);
        expect(violation?.id).toBe("captcha-alternative");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
