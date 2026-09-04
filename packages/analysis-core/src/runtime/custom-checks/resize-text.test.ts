import { describe, expect, it } from "vitest";
import { resizeTextViolation } from "./resize-text";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("resizeTextViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags clipped text after 200% resize at 320 CSS pixels",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <div style="width:400px;overflow:hidden;white-space:nowrap;font-size:16px;">
            Texte très long qui déborde horizontalement après agrandissement à deux cents pourcent.
          </div>
        </body></html>
      `);
      try {
        const violation = await resizeTextViolation(page);
        expect(violation?.id).toBe("complyloop-resize-text");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when text remains readable after resize",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <p>Texte flexible sans contrainte de hauteur fixe.</p>
        </body></html>
      `);
      try {
        const violation = await resizeTextViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
