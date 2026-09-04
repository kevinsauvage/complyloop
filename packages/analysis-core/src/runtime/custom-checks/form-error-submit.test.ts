import { describe, expect, it } from "vitest";
import { formErrorSubmitViolation } from "./form-error-submit";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("formErrorSubmitViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags missing aria association after invalid submit",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <form>
            <label for="email">Email</label>
            <input id="email" name="email" type="email" required />
            <p id="email-error" hidden>Veuillez saisir un email valide.</p>
            <button type="submit">Envoyer</button>
          </form>
        </body></html>
      `);
      try {
        const violation = await formErrorSubmitViolation(page);
        expect(violation?.id).toBe("form-error-association");
        expect(violation?.nodes.some((n) => n.html.includes('id="email"'))).toBe(
          true,
        );
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when errors are associated",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <form>
            <label for="email">Email</label>
            <input id="email" name="email" type="email" required aria-describedby="email-error" />
            <p id="email-error">Veuillez saisir un email valide.</p>
            <button type="submit">Envoyer</button>
          </form>
        </body></html>
      `);
      try {
        const violation = await formErrorSubmitViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
