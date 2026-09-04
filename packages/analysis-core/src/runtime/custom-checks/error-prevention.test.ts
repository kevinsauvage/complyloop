import { describe, expect, it } from "vitest";
import { errorPreventionViolation } from "./error-prevention";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("errorPreventionViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags French checkout without safeguard",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <form action="/paiement">
            <input name="carte" />
            <button type="submit">Payer</button>
          </form>
        </body></html>
      `);
      try {
        const violation = await errorPreventionViolation(page);
        expect(violation?.id).toBe("complyloop-error-prevention");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
