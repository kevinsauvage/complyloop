import { describe, expect, it } from "vitest";

import { liveRegionUpdatesViolation } from "./live-region-updates";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("liveRegionUpdatesViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags visible validation feedback outside live regions after invalid submit",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="en"><body>
          <form id="signup">
            <label>Email <input id="email" type="email" required value="not-an-email" /></label>
            <button type="submit">Send</button>
          </form>
          <p id="status" style="display:none">Email is invalid</p>
          <script>
            const email = document.getElementById("email");
            email.addEventListener("invalid", (event) => {
              event.preventDefault();
              document.getElementById("status").style.display = "block";
            });
          </script>
        </body></html>
      `);
      try {
        const violation = await liveRegionUpdatesViolation(page);
        expect(violation?.id).toBe("live-region-updates");
        expect(violation?.impact).toBe("moderate");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not flag marketing copy revealed by an unrelated button click",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="en"><body>
          <button type="button" id="faq">Open FAQ</button>
          <div id="panel" hidden>
            <p>We successfully applied last year and updated our policy.</p>
          </div>
          <script>
            document.getElementById("faq").addEventListener("click", () => {
              document.getElementById("panel").hidden = false;
            });
          </script>
        </body></html>
      `);
      try {
        const violation = await liveRegionUpdatesViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
