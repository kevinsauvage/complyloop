import { describe, expect, it } from "vitest";

import { cssDisabledContentViolations } from "./css-disabled-content";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withProbePage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("cssDisabledContentViolations", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags essential text carried only by pseudo-elements",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><style>
          .download::before { content: "Télécharger le rapport"; }
          .download {
            display: inline-block;
            width: 120px;
            height: 32px;
            background-image: url("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==");
          }
        </style></head><body>
          <span class="download"></span>
        </body></html>
      `,
        async (page) => {
          const violations = await cssDisabledContentViolations(page);
          expect(violations.some((v) => v.id === "css-disabled-content")).toBe(
            true,
          );
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "flags headings whose only letters live in pseudo-elements",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><head><style>
          h2.chapter::before { content: "Chapter 1"; }
        </style></head><body>
          <h2 class="chapter"></h2>
        </body></html>
      `,
        async (page) => {
          const violations = await cssDisabledContentViolations(page);
          expect(violations.length).toBeGreaterThan(0);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when visible text is in the DOM",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <button>Télécharger</button>
        </body></html>
      `,
        async (page) => {
          const violations = await cssDisabledContentViolations(page);
          expect(violations.length).toBe(0);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when a CSS chevron decorates a button that already has visible text",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="en"><head><style>
          button.menu::after { content: "›"; }
        </style></head><body>
          <button class="menu" type="button">Products</button>
        </body></html>
      `,
        async (page) => {
          const violations = await cssDisabledContentViolations(page);
          expect(violations.length).toBe(0);
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
