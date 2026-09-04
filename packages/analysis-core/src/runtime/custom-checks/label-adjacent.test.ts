import { describe, expect, it } from "vitest";
import {
  gapBetweenRects,
  labelGapExceedsThreshold,
  MAX_LABEL_GAP_PX,
} from "./label-adjacent-math";
import { labelAdjacentViolation } from "./label-adjacent";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  registerPlaywrightBrowserTeardown,
  withPlaywrightPage,
} from "./playwright-page";

registerPlaywrightBrowserTeardown();

describe("gapBetweenRects", () => {
  it("returns zero when rects overlap", () => {
    expect(gapBetweenRects(
      { left: 0, right: 100, top: 0, bottom: 20 },
      { left: 10, right: 90, top: 5, bottom: 15 },
    )).toBe(0);
  });

  it("measures horizontal separation", () => {
    expect(gapBetweenRects(
      { left: 0, right: 80, top: 0, bottom: 20 },
      { left: 100, right: 200, top: 0, bottom: 20 },
    )).toBe(20);
  });

  it("measures horizontal separation when the second rect is to the left", () => {
    expect(gapBetweenRects(
      { left: 100, right: 200, top: 0, bottom: 20 },
      { left: 0, right: 80, top: 0, bottom: 20 },
    )).toBe(20);
  });

  it("measures vertical separation for stacked labels", () => {
    expect(gapBetweenRects(
      { left: 0, right: 100, top: 0, bottom: 20 },
      { left: 0, right: 100, top: 28, bottom: 48 },
    )).toBe(8);
  });

  it("measures vertical separation when the second rect is above", () => {
    expect(gapBetweenRects(
      { left: 0, right: 100, top: 28, bottom: 48 },
      { left: 0, right: 100, top: 0, bottom: 20 },
    )).toBe(8);
  });
});

describe("labelGapExceedsThreshold", () => {
  it(`passes when gap is within ${MAX_LABEL_GAP_PX}px`, () => {
    expect(labelGapExceedsThreshold(
      { left: 0, right: 80, top: 0, bottom: 20 },
      { left: 120, right: 200, top: 0, bottom: 20 },
    )).toBe(false);
  });

  it("flags when gap exceeds the threshold", () => {
    expect(labelGapExceedsThreshold(
      { left: 0, right: 80, top: 0, bottom: 20 },
      { left: 200, right: 280, top: 0, bottom: 20 },
    )).toBe(true);
  });

  it("ignores zero-width rects", () => {
    expect(labelGapExceedsThreshold(
      { left: 0, right: 0, top: 0, bottom: 20 },
      { left: 200, right: 280, top: 0, bottom: 20 },
    )).toBe(false);
  });
});

describe("labelAdjacentViolation", () => {
  it.skipIf(!chromiumExecutableAvailable())(
    "flags a programmatic label that is visually far from its field",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <label for="email" style="display:inline-block">Email</label>
          <input id="email" style="position:absolute;left:220px;top:0" />
        </body></html>
      `);
      try {
        const violation = await labelAdjacentViolation(page);
        expect(violation?.id).toBe("complyloop-label-adjacent");
        expect(violation?.nodes.some((n) => n.html.includes('id="email"'))).toBe(
          true,
        );
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it.skipIf(!chromiumExecutableAvailable())(
    "passes when the label sits next to its field",
    async () => {
      const { page, close } = await withPlaywrightPage(`
        <!doctype html><html lang="fr"><body>
          <label for="email">Email</label>
          <input id="email" />
        </body></html>
      `);
      try {
        const violation = await labelAdjacentViolation(page);
        expect(violation).toBeNull();
      } finally {
        await close();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
