import { describe, expect, it } from "vitest";

import {
  documentWithBody,
  LAYOUT_TABLE_DATA_BODY,
  LAYOUT_TABLE_IMPLICIT_BODY,
} from "./layout-table-fixtures";
import { layoutTableLinearizationViolation } from "./layout-table-linearization";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("layoutTableLinearizationViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags layout tables whose visual order diverges from DOM order",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><head><style>
          table { position: relative; width: 240px; height: 80px; border-collapse: collapse; }
          td { position: absolute; width: 110px; height: 30px; }
          td:nth-child(1) { left: 120px; top: 0; }
          td:nth-child(2) { left: 0; top: 0; }
          td:nth-child(3) { left: 120px; top: 40px; }
          td:nth-child(4) { left: 0; top: 40px; }
        </style></head><body>
          ${LAYOUT_TABLE_IMPLICIT_BODY}
        </body></html>
      `);
      try {
        const violation = await layoutTableLinearizationViolation(page);
        expect(violation?.id).toBe("layout-table-linearization");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes real data tables with headers",
    async () => {
      const { page, close } = await withPlaywrightPage(
        documentWithBody(LAYOUT_TABLE_DATA_BODY),
      );
      try {
        const violation = await layoutTableLinearizationViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
