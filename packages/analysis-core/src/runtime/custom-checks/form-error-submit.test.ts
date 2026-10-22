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
    "leaves browser-native validation alone",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <form>
            <label for="email">Email</label>
            <input id="email" name="email" type="email" required />
            <button type="submit">Envoyer</button>
          </form>
        </body></html>
      `,
        async (page) => {
          expect(await formErrorSubmitViolation(page)).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "flags a custom error (aria-invalid) with no aria association after submit",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <form id="f">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" />
            <p id="email-error">Veuillez saisir un email valide.</p>
            <button type="submit">Envoyer</button>
          </form>
          <script>
            document.getElementById("f").addEventListener("submit", (e) => {
              e.preventDefault();
              document.getElementById("email").setAttribute("aria-invalid", "true");
            });
          </script>
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
          <form id="f">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" aria-describedby="email-error" />
            <p id="email-error">Veuillez saisir un email valide.</p>
            <button type="submit">Envoyer</button>
          </form>
          <script>
            document.getElementById("f").addEventListener("submit", (e) => {
              e.preventDefault();
              document.getElementById("email").setAttribute("aria-invalid", "true");
            });
          </script>
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

  it.skipIf(!chromiumExecutableAvailable())(
    "never lets the probe send a write request to the audited site",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <form id="f" method="post" action="/subscribe">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" />
            <button type="submit">Envoyer</button>
          </form>
        </body></html>
      `,
        async (page) => {
          let reachedNetwork = false;
          await page.route("**/subscribe", async (route) => {
            reachedNetwork = true;
            await route.fulfill({ status: 200, body: "ok" });
          });
          await formErrorSubmitViolation(page);
          expect(reachedNetwork).toBe(false);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "blocks fetch writes fired from the page's own submit handler",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <form id="f">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" />
            <button type="submit">Envoyer</button>
          </form>
          <script>
            document.getElementById("f").addEventListener("submit", (e) => {
              e.preventDefault();
              fetch("/api/subscribe", { method: "POST", body: "x" }).catch(() => {});
            });
          </script>
        </body></html>
      `,
        async (page) => {
          let reachedNetwork = false;
          await page.route("**/api/subscribe", async (route) => {
            reachedNetwork = true;
            await route.fulfill({ status: 200, body: "ok" });
          });
          await formErrorSubmitViolation(page);
          expect(reachedNetwork).toBe(false);
        },
        { routable: true },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
