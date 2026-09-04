import { describe, expect, it } from "vitest";
import { focusCustomViolations } from "./focus";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("focusCustomViolations", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "focus-visible flags a control whose appearance does not change on focus",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><head><style>
          button:focus, button:focus-visible {
            outline: none;
            box-shadow: none;
          }
        </style></head><body>
          <button id="go">Go</button>
        </body></html>
      `);
      try {
        const violations = await focusCustomViolations(page);
        expect(violations.some((v) => v.id === "focus-visible")).toBe(
          true,
        );
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "focus-visible accepts a border change as the indicator",
    async () => {
      const { page, close } = await withPlaywrightPage(`
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
      `);
      try {
        const violations = await focusCustomViolations(page);
        expect(violations.some((v) => v.id === "focus-visible")).toBe(
          false,
        );
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "focus-visible flags a persistent shadow that is not a focus indicator",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><head><style>
          button, button:focus, button:focus-visible {
            outline: none;
            box-shadow: 0 1px 2px rgb(0, 0, 0);
          }
        </style></head><body>
          <button id="go">Go</button>
        </body></html>
      `);
      try {
        const violations = await focusCustomViolations(page);
        expect(violations.some((v) => v.id === "focus-visible")).toBe(
          true,
        );
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
