import { describe, expect, it } from "vitest";

import { formErrorSubmitViolation } from "./form-error-submit";
import { runCustomRuntimeChecks } from "./index";
import { liveRegionUpdatesViolation } from "./live-region-updates";
import { restorePageAfterMutatingProbes } from "./page-restore";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withProbePage,
} from "./playwright-page";
import { reflowViolation } from "./reflow";

registerPlaywrightBrowserTeardown();

describe("restorePageAfterMutatingProbes", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "reloads the page so a heading survives after form submit probes",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <h1 id="title">Contact</h1>
          <form>
            <input required name="email" type="email">
            <button type="submit">Send</button>
          </form>
          <div id="wide" style="width:800px">Wide content</div>
        </body></html>
      `,
        async (page) => {
          await formErrorSubmitViolation(page);
          await liveRegionUpdatesViolation(page);
          await restorePageAfterMutatingProbes(page);

          expect(await page.locator("h1").textContent()).toBe("Contact");
          const reflow = await reflowViolation(page);
          expect(reflow?.id).toBe("reflow");
        },
        { routable: true },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});

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
