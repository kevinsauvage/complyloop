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
        expect(violation?.id).toBe("error-prevention");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not flag a high-risk form with data-review-step",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="en"><body>
          <form action="/checkout" data-review-step="1">
            <input name="card" />
            <button type="submit">Pay</button>
          </form>
        </body></html>
      `);
      try {
        const violation = await errorPreventionViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
