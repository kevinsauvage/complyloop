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
    "flags visible status outside live regions",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <form novalidate>
            <input id="email" type="email" />
            <button id="save" type="button">Send</button>
          </form>
          <p id="status" style="display:none">Error: invalid email</p>
          <script>
            document.getElementById("save").addEventListener("click", () => {
              document.getElementById("status").style.display = "block";
            });
          </script>
        </body></html>
      `);
      try {
        const violation = await liveRegionUpdatesViolation(page);
        expect(violation?.id).toBe("complyloop-live-region-updates");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
