import { describe, expect, it } from "vitest";

import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withProbePage,
} from "./playwright-page";
import { registerPlaywrightBrowserTeardown } from "./playwright-test-teardown";
import { textSpacingRuntimeViolation } from "./text-spacing-runtime";

registerPlaywrightBrowserTeardown();

describe("textSpacingRuntimeViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags text clipped when WCAG text-spacing overrides are applied",
    async () => {
      await withProbePage(
        `
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
      `,
        async (page) => {
          const violation = await textSpacingRuntimeViolation(page);
          expect(violation?.id).toBe("text-spacing-runtime");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when text can expand without clipping",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><body>
          <p>Texte qui peut s'étendre sans être masqué.</p>
        </body></html>
      `,
        async (page) => {
          const violation = await textSpacingRuntimeViolation(page);
          expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "ignores deliberately clipped sr-only content like skip links",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><style>
          .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border-width: 0;
          }
        </style></head><body>
          <a href="#main" class="sr-only">Aller au contenu principal de la page</a>
          <main id="main"><p>Contenu flexible sans contrainte.</p></main>
        </body></html>
      `,
        async (page) => {
          const violation = await textSpacingRuntimeViolation(page);
          expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
