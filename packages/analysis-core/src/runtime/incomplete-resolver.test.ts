import { describe, expect, it } from "vitest";

import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./custom-checks/playwright-page";
import { registerPlaywrightBrowserTeardown } from "./custom-checks/playwright-test-teardown";
import type { AxeViolationLike } from "./findings";
import { resolveIncompleteResults } from "./incomplete-resolver";

registerPlaywrightBrowserTeardown();

function incompleteFor(id: string, ...targets: string[]): AxeViolationLike {
  return {
    id,
    impact: null,
    description: "d",
    help: "h",
    nodes: targets.map((target) => ({ html: "<x>", target: [target] })),
  };
}

describe("resolveIncompleteResults: color-contrast", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "drops text that clears the ratio over a gradient axe could not read",
    async () => {
      await withProbePage(
        `<!doctype html><body style="margin:0">
          <div style="background:linear-gradient(90deg,#0b1020,#1b2a4a);padding:30px">
            <p id="ok" style="margin:0;color:#ffffff;font:20px sans-serif">Readable over a dark gradient</p>
          </div></body>`,
        async (page) => {
          const result = await resolveIncompleteResults(page, [
            incompleteFor("color-contrast", "#ok"),
          ]);
          expect(result.incomplete).toEqual([]);
          expect(result.confirmed).toEqual([]);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "confirms a failure when the text is too close to the gradient behind it",
    async () => {
      await withProbePage(
        `<!doctype html><body style="margin:0">
          <div style="background:linear-gradient(90deg,#e8e8e8,#f4f4f4);padding:30px">
            <p id="bad" style="margin:0;color:#d0d0d0;font:20px sans-serif">Pale on pale</p>
          </div></body>`,
        async (page) => {
          const result = await resolveIncompleteResults(page, [
            incompleteFor("color-contrast", "#bad"),
          ]);
          expect(result.incomplete).toEqual([]);
          expect(result.confirmed).toHaveLength(1);
          expect(result.confirmed[0]?.impact).toBe("serious");
          expect(result.confirmed[0]?.nodes[0]?.failureSummary).toMatch(
            /rendered background/,
          );
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "keeps text that passes on most of the background but fails on part of it",
    async () => {
      await withProbePage(
        `<!doctype html><body style="margin:0">
          <div style="background:linear-gradient(90deg,#000000 0 70%,#808080 70% 100%);padding:30px;width:700px;box-sizing:border-box">
            <p id="mixed" style="margin:0;color:#ffffff;font:20px sans-serif">White over mostly black, a gray corner</p>
          </div></body>`,
        async (page) => {
          const result = await resolveIncompleteResults(page, [
            incompleteFor("color-contrast", "#mixed"),
          ]);
          expect(result.confirmed).toEqual([]);
          expect(result.incomplete[0]?.nodes).toHaveLength(1);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "uses the relaxed 3:1 ratio for large text",
    async () => {
      await withProbePage(
        `<!doctype html><body style="margin:0;background:#ffffff">
          <h1 id="big" style="margin:20px;color:#8a8a8a;font:700 40px sans-serif">Large heading</h1>
          </body>`,
        async (page) => {
          const result = await resolveIncompleteResults(page, [
            incompleteFor("color-contrast", "#big"),
          ]);
          // #8a8a8a on white is ~3.4:1: fails 4.5 but passes the 3:1 large-text bar.
          expect(result.incomplete).toEqual([]);
          expect(result.confirmed).toEqual([]);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "keeps a node it cannot locate",
    async () => {
      await withProbePage(
        `<!doctype html><body><p>x</p></body>`,
        async (page) => {
          const result = await resolveIncompleteResults(page, [
            incompleteFor("color-contrast", "#missing"),
          ]);
          expect(result.incomplete[0]?.nodes).toHaveLength(1);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});

describe("resolveIncompleteResults: heading-order", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "drops headings that follow the previous level and confirms a real skip",
    async () => {
      await withProbePage(
        `<!doctype html><body>
          <h1 id="a">Title</h1><h2 id="b">Section</h2><h3 id="c">Sub</h3>
          <h2 id="d">Next</h2><h4 id="e">Skipped</h4></body>`,
        async (page) => {
          const result = await resolveIncompleteResults(page, [
            incompleteFor("heading-order", "#a", "#b", "#c", "#d", "#e"),
          ]);
          expect(result.incomplete).toEqual([]);
          expect(result.confirmed).toHaveLength(1);
          expect(result.confirmed[0]?.nodes.map((n) => n.target[0])).toEqual([
            "#e",
          ]);
          expect(result.confirmed[0]?.impact).toBe("moderate");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "ignores hidden headings when judging the sequence",
    async () => {
      await withProbePage(
        `<!doctype html><body>
          <h1 id="a">Title</h1><h4 hidden>Hidden</h4><h2 id="b">Section</h2></body>`,
        async (page) => {
          const result = await resolveIncompleteResults(page, [
            incompleteFor("heading-order", "#a", "#b"),
          ]);
          expect(result.incomplete).toEqual([]);
          expect(result.confirmed).toEqual([]);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it("passes other rules through untouched", async () => {
    const rule = incompleteFor("aria-valid-attr-value", "#x");
    const result = await resolveIncompleteResults({} as never, [rule]);
    expect(result).toEqual({ incomplete: [rule], confirmed: [] });
  });
});
