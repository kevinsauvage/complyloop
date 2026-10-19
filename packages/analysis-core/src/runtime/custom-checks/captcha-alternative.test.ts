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

  it.skipIf(!chromiumExecutableAvailable())(
    "ignores the footprint of invisible reCAPTCHA v3",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <script id="google-recaptcha-v3" src="https://www.google.com/recaptcha/api.js?render=6LeXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"></script>
          <div class="grecaptcha-badge"><iframe title="reCAPTCHA" role="presentation" width="256" height="60"></iframe></div>
          <textarea id="g-recaptcha-response-100000" name="g-recaptcha-response" class="g-recaptcha-response"></textarea>
        </body></html>
      `,
        async (page) => {
          expect(await captchaAlternativeViolation(page)).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "still flags a visible widget on a page that also loads v3",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <script src="https://www.google.com/recaptcha/api.js?render=6LeXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"></script>
          <div class="g-recaptcha" data-sitekey="x"></div>
        </body></html>
      `,
        async (page) => {
          expect((await captchaAlternativeViolation(page))?.id).toBe(
            "captcha-alternative",
          );
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
