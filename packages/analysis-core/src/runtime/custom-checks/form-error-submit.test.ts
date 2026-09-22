import { describe, expect, it } from "vitest";

import { formErrorSubmitViolation } from "./form-error-submit";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./playwright-page";
import { registerPlaywrightBrowserTeardown } from "./playwright-test-teardown";

registerPlaywrightBrowserTeardown();

describe("formErrorSubmitViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags missing aria association after invalid submit",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <form>
            <label for="email">Email</label>
            <input id="email" name="email" type="email" required />
            <p id="email-error" hidden>Veuillez saisir un email valide.</p>
            <button type="submit">Envoyer</button>
          </form>
        </body></html>
      `,
        async (page) => {
          const violation = await formErrorSubmitViolation(page);
          expect(violation?.id).toBe("form-error-association");
          expect(
            violation?.nodes.some((n) => n.html.includes('id="email"')),
          ).toBe(true);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when errors are associated",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <form>
            <label for="email">Email</label>
            <input id="email" name="email" type="email" required aria-describedby="email-error" />
            <p id="email-error">Veuillez saisir un email valide.</p>
            <button type="submit">Envoyer</button>
          </form>
        </body></html>
      `,
        async (page) => {
          const violation = await formErrorSubmitViolation(page);
          expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
