import { describe, expect, it } from "vitest";
import { accessibleAuthEnhancedViolation } from "./accessible-auth-enhanced";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("accessibleAuthEnhancedViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags puzzle captcha on an authentication page",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><head><title>Connexion</title></head><body>
          <main>
            <h1>Connexion</h1>
            <form><label>Mot de passe<input type="password" /></label></form>
            <iframe title="Sélectionnez tous les feux tricolores"></iframe>
          </main>
        </body></html>
      `);
      try {
        const violation = await accessibleAuthEnhancedViolation(page);
        expect(violation?.id).toBe("accessible-auth-enhanced");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when auth context has no puzzle captcha",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><head><title>Connexion</title></head><body>
          <main>
            <h1>Connexion</h1>
            <form><label>Mot de passe<input type="password" /></label></form>
          </main>
        </body></html>
      `);
      try {
        const violation = await accessibleAuthEnhancedViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
