import { describe, expect, it } from "vitest";

import { accessibleAuthEnhancedViolation } from "./accessible-auth-enhanced";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./playwright-page";
import { registerPlaywrightBrowserTeardown } from "./playwright-test-teardown";

registerPlaywrightBrowserTeardown();

describe("accessibleAuthEnhancedViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags puzzle captcha on an authentication page",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><title>Connexion</title></head><body>
          <main>
            <h1>Connexion</h1>
            <form><label>Mot de passe<input type="password" /></label></form>
            <iframe title="Sélectionnez tous les feux tricolores"></iframe>
          </main>
        </body></html>
      `,
        async (page) => {
          const violation = await accessibleAuthEnhancedViolation(page);
          expect(violation?.id).toBe("accessible-auth-enhanced");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "flags g-recaptcha with data-size on an authentication page",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><head><title>Sign in</title></head><body>
          <main>
            <h1>Log in</h1>
            <form><label>Password<input type="password" /></label></form>
            <div class="g-recaptcha" data-sitekey="x" data-size="normal"></div>
          </main>
        </body></html>
      `,
        async (page) => {
          const violation = await accessibleAuthEnhancedViolation(page);
          expect(violation?.id).toBe("accessible-auth-enhanced");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not flag checkbox-style g-recaptcha without size on auth pages",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><head><title>Sign in</title></head><body>
          <main>
            <h1>Log in</h1>
            <form><label>Password<input type="password" /></label></form>
            <div class="g-recaptcha" data-sitekey="x"></div>
          </main>
        </body></html>
      `,
        async (page) => {
          const violation = await accessibleAuthEnhancedViolation(page);
          expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "flags puzzlecaptcha host on an authentication page",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><head><title>Sign in</title></head><body>
          <main>
            <h1>Log in</h1>
            <form><label>Password<input type="password" /></label></form>
            <puzzlecaptcha></puzzlecaptcha>
          </main>
        </body></html>
      `,
        async (page) => {
          const violation = await accessibleAuthEnhancedViolation(page);
          expect(violation?.id).toBe("accessible-auth-enhanced");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when auth context has no puzzle captcha",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><title>Connexion</title></head><body>
          <main>
            <h1>Connexion</h1>
            <form><label>Mot de passe<input type="password" /></label></form>
          </main>
        </body></html>
      `,
        async (page) => {
          const violation = await accessibleAuthEnhancedViolation(page);
          expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
