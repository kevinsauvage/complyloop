import { describe, expect, it } from "vitest";

import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withProbePage,
} from "./playwright-page";
import { reducedMotionViolation } from "./reduced-motion";

registerPlaywrightBrowserTeardown();

describe("reducedMotionViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags an animation that ignores the preference",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><style>
          @keyframes spin { to { transform: rotate(360deg); } }
          .spinner { width: 20px; height: 20px; animation: spin 1s linear infinite; }
        </style></head><body>
          <span class="spinner" role="status" aria-label="Chargement"></span>
        </body></html>
      `,
        async (page) => {
          const violation = await reducedMotionViolation(page);
          expect(violation?.id).toBe("reduced-motion");
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when the animation is disabled via the media query",
    async () => {
      await withProbePage(
        `
        <!doctype html><html lang="fr"><head><style>
          @keyframes spin { to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) {
            .spinner { animation: none !important; }
          }
          .spinner { width: 20px; height: 20px; animation: spin 1s linear infinite; }
        </style></head><body>
          <span class="spinner"></span>
        </body></html>
      `,
        async (page) => {
          const violation = await reducedMotionViolation(page);
          expect(violation).toBeNull();
        },
      );
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
