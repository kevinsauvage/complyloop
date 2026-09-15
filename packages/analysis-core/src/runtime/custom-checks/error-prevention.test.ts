import { describe, expect, it } from "vitest";

import { errorPreventionViolation } from "./error-prevention";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withProbePage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("errorPreventionViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags French checkout without safeguard",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <form action="/paiement">
            <input name="carte" />
            <button type="submit">Payer</button>
          </form>
        </body></html>
      `,
        async (page) => {
          const violation = await errorPreventionViolation(page);
          expect(violation?.id).toBe("error-prevention");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not flag a high-risk form with data-review-step",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><body>
          <form action="/checkout" data-review-step="1">
            <input name="card" />
            <button type="submit">Pay</button>
          </form>
        </body></html>
      `,
        async (page) => {
          const violation = await errorPreventionViolation(page);
          expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
