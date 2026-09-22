import { describe, expect, it } from "vitest";

import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./playwright-page";
import { registerPlaywrightBrowserTeardown } from "./playwright-test-teardown";
import { isTwoDimensionalLayout } from "./reflow";
import { REFLOW_VIEWPORT } from "./reflow";
import { reflowViolation } from "./reflow";

registerPlaywrightBrowserTeardown();

describe("reflow viewport constants", () => {
  it("uses the WCAG 320 CSS pixel width", () => {
    expect(REFLOW_VIEWPORT.width).toBe(320);
    expect(REFLOW_VIEWPORT.height).toBe(568);
  });
});

describe("reflow exemptions", () => {
  it("detects 2D layout exceptions", () => {
    expect(isTwoDimensionalLayout("table", null)).toBe(true);
    expect(isTwoDimensionalLayout("div", null)).toBe(false);
  });

  it("exempts data tables, grids, and maps", () => {
    expect(isTwoDimensionalLayout("table", null)).toBe(true);
    expect(isTwoDimensionalLayout("div", "grid")).toBe(true);
    expect(isTwoDimensionalLayout("div", "treegrid")).toBe(true);
    expect(isTwoDimensionalLayout("map", null)).toBe(true);
  });

  it("exempts images, diagrams, video, and code blocks", () => {
    expect(isTwoDimensionalLayout("img", null)).toBe(true);
    expect(isTwoDimensionalLayout("svg", null)).toBe(true);
    expect(isTwoDimensionalLayout("canvas", null)).toBe(true);
    expect(isTwoDimensionalLayout("video", null)).toBe(true);
    expect(isTwoDimensionalLayout("iframe", null)).toBe(true);
    expect(isTwoDimensionalLayout("pre", null)).toBe(true);
    expect(isTwoDimensionalLayout("div", "img")).toBe(true);
  });

  it("does not exempt ordinary layout containers", () => {
    expect(isTwoDimensionalLayout("div", null)).toBe(false);
    expect(isTwoDimensionalLayout("section", "region")).toBe(false);
    expect(isTwoDimensionalLayout("button", "button")).toBe(false);
  });
});

describe("reflowViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags a non-exempt wide container at 320px",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <div id="wide" style="width:800px">Wide content that cannot wrap.</div>
        </body></html>
      `,
        async (page) => {
          const violation = await reflowViolation(page);
          expect(violation?.id).toBe("reflow");
          const node = violation!.nodes[0]!;
          expect({
            target: node.target,
            html: node.html,
          }).toEqual({
            target: ["#wide"],
            html: '<div id="wide" style="width:800px">Wide content that cannot wrap.</div>',
          });
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes a wide data table (2D exception)",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <table id="data">
            <tr><td style="width:400px">A</td><td style="width:400px">B</td></tr>
          </table>
        </body></html>
      `,
        async (page) => {
          const violation = await reflowViolation(page);
          expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes a wide image (2D exception)",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <img id="chart" width="800" height="20" alt="chart"
            src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==">
        </body></html>
      `,
        async (page) => {
          const violation = await reflowViolation(page);
          expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
