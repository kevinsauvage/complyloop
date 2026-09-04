import { describe, expect, it } from "vitest";
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
          <table>
            <tr>
              <td>Alpha one</td>
              <td>Bravo two</td>
            </tr>
            <tr>
              <td>Charlie three</td>
              <td>Delta four</td>
            </tr>
          </table>
        </body></html>
      `);
      try {
        const violation = await layoutTableLinearizationViolation(page);
        expect(violation?.id).toBe("complyloop-layout-table-linearization");
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes real data tables with headers",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <table>
            <caption>Scores</caption>
            <thead><tr><th scope="col">Nom</th><th scope="col">Points</th></tr></thead>
            <tbody>
              <tr><td>Alice</td><td>10</td></tr>
              <tr><td>Bob</td><td>8</td></tr>
            </tbody>
          </table>
        </body></html>
      `);
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
