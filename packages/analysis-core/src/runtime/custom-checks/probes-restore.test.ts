import { describe, expect, it } from "vitest";

import { runCustomRuntimeChecks } from "./index";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./playwright-page";
import { registerPlaywrightBrowserTeardown } from "./playwright-test-teardown";

registerPlaywrightBrowserTeardown();

describe("runCustomRuntimeChecks page restore", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "still runs reflow on a page with a form after mutating probes",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <h1 id="title">Dashboard</h1>
          <form>
            <input required name="email" type="email">
            <button type="submit">Send</button>
          </form>
          <div style="width:800px">Wide block</div>
        </body></html>
      `,
        async (page) => {
          const results = await runCustomRuntimeChecks(page, page.url());
          expect(await page.locator("h1").textContent()).toBe("Dashboard");
          expect(
            results.findings.some((result) => result.checkId === "reflow"),
          ).toBe(true);
        },
        { routable: true },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
