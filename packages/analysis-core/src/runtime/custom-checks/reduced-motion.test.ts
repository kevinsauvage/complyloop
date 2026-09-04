import { describe, expect, it } from "vitest";
import { reducedMotionViolation } from "./reduced-motion";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("reducedMotionViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags an animation that ignores the preference",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><head><style>
          @keyframes spin { to { transform: rotate(360deg); } }
          .spinner { width: 20px; height: 20px; animation: spin 1s linear infinite; }
        </style></head><body>
          <span class="spinner" role="status" aria-label="Chargement"></span>
        </body></html>
      `);
      try {
        const violation = await reducedMotionViolation(page);
        expect(violation?.id).toBe("complyloop-reduced-motion");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when the animation is disabled via the media query",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><head><style>
          @keyframes spin { to { transform: rotate(360deg); } }
          @media (prefers-reduced-motion: reduce) {
            .spinner { animation: none !important; }
          }
          .spinner { width: 20px; height: 20px; animation: spin 1s linear infinite; }
        </style></head><body>
          <span class="spinner"></span>
        </body></html>
      `);
      try {
        const violation = await reducedMotionViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
