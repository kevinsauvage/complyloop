import { describe, expect, it } from "vitest";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";
import { restorePageAfterMutatingProbes } from "./page-restore";
import { formErrorSubmitViolation } from "./form-error-submit";
import { liveRegionUpdatesViolation } from "./live-region-updates";
import { reflowViolation } from "./reflow";
import { runCustomRuntimeChecks } from "./index";

registerPlaywrightBrowserTeardown();

describe("restorePageAfterMutatingProbes", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "reloads the page so a heading survives after form submit probes",
    async () => {
      const { page, close } = await withPlaywrightPage(
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
        { routable: true },
      );
      try {
        await formErrorSubmitViolation(page);
        await liveRegionUpdatesViolation(page);
        await restorePageAfterMutatingProbes(page);

        expect(await page.locator("h1").textContent()).toBe("Contact");
        const reflow = await reflowViolation(page);
        expect(reflow?.id).toBe("reflow");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});

describe("runCustomRuntimeChecks page restore", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "still runs reflow on a page with a form after mutating probes",
    async () => {
      const { page, close } = await withPlaywrightPage(
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
        { routable: true },
      );
      try {
        const results = await runCustomRuntimeChecks(page, page.url());
        expect(await page.locator("h1").textContent()).toBe("Dashboard");
        expect(results.some((result) => result.checkId === "reflow")).toBe(
          true,
        );
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
