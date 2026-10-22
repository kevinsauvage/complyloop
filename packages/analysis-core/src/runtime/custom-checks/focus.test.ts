import { describe, expect, it } from "vitest";

import { focusCustomViolations } from "./focus";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./playwright-page";
import { registerPlaywrightBrowserTeardown } from "./playwright-test-teardown";

registerPlaywrightBrowserTeardown();

describe("focusCustomViolations", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "focus-visible flags a control whose appearance does not change on focus",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><style>
          button:focus, button:focus-visible {
            outline: none;
            box-shadow: none;
          }
        </style></head><body>
          <button id="go">Go</button>
        </body></html>
      `,
        async (page) => {
          const violations = await focusCustomViolations(page);
          const focusVisible = violations.find((v) => v.id === "focus-visible");
          expect(focusVisible).toBeDefined();
          const node = focusVisible!.nodes[0]!;
          expect({
            target: node.target,
            elementLabel: node.elementLabel,
            html: node.html,
          }).toEqual({
            target: ["#go"],
            elementLabel: "button “Go”",
            html: '<button id="go">Go</button>',
          });
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "focus-visible accepts a ring that fades in over a transition",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><head><style>
          button { outline: none; transition: all 800ms ease-out; box-shadow: 0 0 0 0 transparent; }
          button:focus-visible { box-shadow: 0 0 0 3px #1d4ed8; }
        </style></head><body>
          <button id="go">Go</button>
        </body></html>
      `,
        async (page) => {
          const violations = await focusCustomViolations(page);
          expect(
            violations.find((v) => v.id === "focus-visible"),
          ).toBeUndefined();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "focus-visible accepts a border change as the indicator",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><style>
          button {
            outline: none;
            border: 1px solid #ccc;
          }
          button:focus-visible {
            outline: none;
            border-color: #0050ff;
          }
        </style></head><body>
          <button id="go">Go</button>
        </body></html>
      `,
        async (page) => {
          const violations = await focusCustomViolations(page);
          expect(violations.some((v) => v.id === "focus-visible")).toBe(false);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "focus-visible flags a persistent shadow that is not a focus indicator",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><style>
          button, button:focus, button:focus-visible {
            outline: none;
            box-shadow: 0 1px 2px rgb(0, 0, 0);
          }
        </style></head><body>
          <button id="go">Go</button>
        </body></html>
      `,
        async (page) => {
          const violations = await focusCustomViolations(page);
          expect(violations.some((v) => v.id === "focus-visible")).toBe(true);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "keeps walking past quiet stops so late controls are still checked",
    async () => {
      const quiet = Array.from(
        { length: 12 },
        (_, i) => `<a href="#q${i}" class="ok">Link ${i}</a>`,
      ).join("\n");
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><style>
          a.ok:focus-visible { outline: 3px solid #005fcc; }
          #first:focus-visible, #last:focus-visible { outline: none; box-shadow: none; }
        </style></head><body>
          <button id="first">First</button>
          ${quiet}
          <button id="last">Last</button>
        </body></html>
      `,
        async (page) => {
          const violations = await focusCustomViolations(page);
          const nodes =
            violations.find((v) => v.id === "focus-visible")?.nodes ?? [];
          expect(nodes.map((n) => n.target[0])).toEqual(["#first", "#last"]);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "does not report a keyboard trap for many links sharing one class",
    async () => {
      const links = Array.from(
        { length: 20 },
        (_, i) => `<a href="#l${i}" class="link-underline">Link ${i}</a>`,
      ).join("\n");
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><style>
          a:focus-visible { outline: 3px solid #005fcc; }
        </style></head><body>${links}</body></html>
      `,
        async (page) => {
          const violations = await focusCustomViolations(page);
          expect(violations.find((v) => v.id === "keyboard-trap")).toBe(
            undefined,
          );
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "focus-not-obscured ignores a control only partly covered by an overlay",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><style>
          button:focus-visible { outline: 3px solid #005fcc; }
          #bar { position: fixed; left: 0; right: 0; top: 0; height: 40px; background: #fff; }
          #go { position: absolute; top: 30px; left: 20px; width: 120px; height: 40px; }
        </style></head><body>
          <div id="bar">Sticky bar</div>
          <button id="go">Go</button>
        </body></html>
      `,
        async (page) => {
          const violations = await focusCustomViolations(page);
          expect(violations.find((v) => v.id === "focus-not-obscured")).toBe(
            undefined,
          );
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "reports a truncated walk as an advisory instead of a clean pass",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><style>
          button:focus-visible { outline: 3px solid #005fcc; }
        </style></head><body>
          <button id="a">One</button>
          <button id="b">Two</button>
          <button id="c">Three</button>
        </body></html>
      `,
        async (page) => {
          // A 4-stop budget against 3 focusables walks 4 stops; a 3-stop
          // budget leaves the last controls uninspected.
          const violations = await focusCustomViolations(page, { maxStops: 3 });
          const advisories = violations.filter((v) => v.advisory);
          expect(advisories.map((v) => v.id)).toEqual([
            "focus-visible",
            "keyboard-trap",
            "focus-not-obscured",
          ]);
          expect(advisories[0]!.nodes[0]!.failureSummary).toContain(
            "Focus walk stopped after 3 Tab stops",
          );
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
