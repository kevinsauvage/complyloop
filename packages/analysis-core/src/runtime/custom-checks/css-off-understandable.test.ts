import { describe, expect, it } from "vitest";

import { cssOffUnderstandableViolation } from "./css-off-understandable";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("cssOffUnderstandableViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags flex order that scrambles reading order when CSS is disabled",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><head><style>
          .row { display: flex; }
          .a { order: 2; }
          .b { order: 1; }
        </style></head><body>
          <div class="row">
            <p class="a">Premier dans le DOM</p>
            <p class="b">Deuxième dans le DOM</p>
          </div>
        </body></html>
      `);
      try {
        const violation = await cssOffUnderstandableViolation(page);
        expect(violation?.id).toBe("css-off-understandable");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when essential text remains without CSS",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <p>Contenu principal toujours visible même lorsque les styles sont désactivés.</p>
        </body></html>
      `);
      try {
        const violation = await cssOffUnderstandableViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "restores stylesheets after the check so later probes see CSS",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><head>
          <style>
            #probe { color: rgb(0, 0, 255); }
          </style>
        </head><body>
          <p id="probe">Texte visible avec styles.</p>
        </body></html>
      `);
      try {
        await cssOffUnderstandableViolation(page);
        const color = await page.evaluate(() => {
          const el = document.querySelector("#probe");
          if (!el) return "";
          return getComputedStyle(el).color;
        });
        expect(color).toBe("rgb(0, 0, 255)");
        const styleDisabled = await page.evaluate(() => {
          const style = document.querySelector("style");
          return style?.disabled ?? false;
        });
        expect(styleDisabled).toBe(false);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
