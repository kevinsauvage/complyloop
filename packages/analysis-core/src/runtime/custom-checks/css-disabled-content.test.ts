import { describe, expect, it } from "vitest";
import { cssDisabledContentViolations } from "./css-disabled-content";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("cssDisabledContentViolations", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags essential text carried only by pseudo-elements",
    async () => {
      const { page, close } = await withPlaywrightPage(`
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
      `);
      try {
        const violations = await cssDisabledContentViolations(page);
        expect(violations.some((v) => v.id === "complyloop-css-disabled-content")).toBe(
          true,
        );
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when visible text is in the DOM",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <button>Télécharger</button>
        </body></html>
      `);
      try {
        const violations = await cssDisabledContentViolations(page);
        expect(violations.length).toBe(0);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
