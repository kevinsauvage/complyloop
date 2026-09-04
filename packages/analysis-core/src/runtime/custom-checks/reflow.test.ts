import { describe, expect, it } from "vitest";
import { isTwoDimensionalLayout } from "./reflow-exceptions";
import {
  elementWiderThanViewport,
  hasHorizontalOverflow,
  REFLOW_VIEWPORT,
} from "./reflow-math";
import { reflowViolation } from "./reflow";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("reflow viewport constants", () => {
  it("uses the WCAG 320 CSS pixel width", () => {
    expect(REFLOW_VIEWPORT.width).toBe(320);
    expect(REFLOW_VIEWPORT.height).toBe(568);
  });
});

describe("hasHorizontalOverflow", () => {
  it("detects document-level horizontal scroll", () => {
    expect(hasHorizontalOverflow(400, 320)).toBe(true);
    expect(hasHorizontalOverflow(320, 320)).toBe(false);
  });
});

describe("elementWiderThanViewport", () => {
  it("flags elements wider than the reflow viewport", () => {
    expect(elementWiderThanViewport(800, 320)).toBe(true);
    expect(elementWiderThanViewport(300, 320)).toBe(false);
  });
});

describe("reflow exemptions", () => {
  it("delegates 2D layout detection to reflow-exceptions", () => {
    expect(isTwoDimensionalLayout("table", null)).toBe(true);
    expect(isTwoDimensionalLayout("div", null)).toBe(false);
  });
});

describe("reflowViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags a non-exempt wide container at 320px",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <div id="wide" style="width:800px">Wide content that cannot wrap.</div>
        </body></html>
      `);
      try {
        const violation = await reflowViolation(page);
        expect(violation?.id).toBe("complyloop-reflow");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes a wide data table (2D exception)",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <table id="data">
            <tr><td style="width:400px">A</td><td style="width:400px">B</td></tr>
          </table>
        </body></html>
      `);
      try {
        const violation = await reflowViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes a wide image (2D exception)",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <img id="chart" width="800" height="20" alt="chart"
            src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
        </body></html>
      `);
      try {
        const violation = await reflowViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
