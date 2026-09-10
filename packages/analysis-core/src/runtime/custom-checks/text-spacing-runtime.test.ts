import { describe, expect, it } from "vitest";

import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";
import { textSpacingRuntimeViolation } from "./text-spacing-runtime";

registerPlaywrightBrowserTeardown();

describe("textSpacingRuntimeViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags text clipped when WCAG text-spacing overrides are applied",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><head><style>
          .clip {
            width: 120px;
            height: 24px;
            overflow: hidden;
            line-height: 1;
          }
        </style></head><body>
          <p class="clip">Texte long qui déborde lorsque l'espacement augmente.</p>
        </body></html>
      `);
      try {
        const violation = await textSpacingRuntimeViolation(page);
        expect(violation?.id).toBe("text-spacing-runtime");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when text can expand without clipping",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <p>Texte qui peut s'étendre sans être masqué.</p>
        </body></html>
      `);
      try {
        const violation = await textSpacingRuntimeViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
