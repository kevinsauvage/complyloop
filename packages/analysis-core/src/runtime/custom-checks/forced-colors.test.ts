import { describe, expect, it } from "vitest";

import { forcedColorsViolation } from "./forced-colors";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("forcedColorsViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags a decoration-only control that disappears",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><head><style>
          .icon-btn {
            box-shadow: 0 0 0 2px #000;
            border: 0;
            background: transparent;
          }
          .ok { border: 2px solid #000; background: #fff; }
        </style></head><body>
          <button class="icon-btn" aria-label="Supprimer"></button>
          <button class="ok">Sauvegarder</button>
        </body></html>
      `);
      try {
        const violation = await forcedColorsViolation(page);
        expect(violation?.id).toBe("forced-colors");
        expect(violation?.nodes.some((n) => n.html.includes("icon-btn"))).toBe(
          true,
        );
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes controls with a real border",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <button style="border: 2px solid #000; background: #fff;">OK</button>
        </body></html>
      `);
      try {
        const violation = await forcedColorsViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "reports two identical failing buttons as two distinct nodes (P1-4)",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><head><style>
          .icon-btn { box-shadow: 0 0 0 2px #000; border: 0; background: transparent; }
        </style></head><body>
          <button class="icon-btn" aria-label="Supprimer"></button>
          <button class="icon-btn" aria-label="Supprimer"></button>
        </body></html>
      `);
      try {
        const violation = await forcedColorsViolation(page);
        expect(violation?.nodes).toHaveLength(2);
        const targets = violation?.nodes.map((n) => n.target[0]) ?? [];
        expect(new Set(targets).size).toBe(2);
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
