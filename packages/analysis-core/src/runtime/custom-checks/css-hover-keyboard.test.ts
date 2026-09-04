import { describe, expect, it } from "vitest";
import { cssHoverKeyboardViolation } from "./css-hover-keyboard";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("cssHoverKeyboardViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags hover-only menus without a focus equivalent",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><head><style>
          .menu { position: relative; display: inline-block; }
          .menu .panel {
            display: none;
            position: absolute;
            background: #fff;
            border: 1px solid #000;
            padding: 8px;
            min-width: 160px;
          }
          .menu:hover .panel { display: block; }
        </style></head><body>
          <div class="menu">
            <button type="button">Menu</button>
            <div class="panel">Sous-menu accessible uniquement au survol.</div>
          </div>
        </body></html>
      `);
      try {
        const violation = await cssHoverKeyboardViolation(page);
        expect(violation?.id).toBe("complyloop-css-hover-keyboard");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
