// The resolver paints on a real canvas: only Chromium can be asked, and the
// unit job has no browser, so the suite skips there (e2e covers it).
import type { Page } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseCssColor, type ParsedCssColor } from "./css-color";
import {
  chromiumExecutableAvailable,
  PLAYWRIGHT_TEST_TIMEOUT_MS,
  withPlaywrightPage,
} from "./custom-checks/playwright-page";
import { registerPlaywrightBrowserTeardown } from "./custom-checks/playwright-test-teardown";

registerPlaywrightBrowserTeardown();

/** Mirrors the page probes: the parser is serialized into the page source. */
const PARSER_SRC = `const parseCssColor = (${parseCssColor.toString()}); return parseCssColor(value);`;

const ALPHA_TOLERANCE = 1 / 255;

let page: Page | null = null;
let closePage: (() => Promise<void>) | null = null;

describe.skipIf(!chromiumExecutableAvailable())("parseCssColor", () => {
  beforeAll(async () => {
    const opened = await withPlaywrightPage("<!doctype html><body></body>");
    page = opened.page;
    closePage = opened.close;
  });

  afterAll(async () => {
    await closePage?.();
  });

  async function resolve(
    ...values: string[]
  ): Promise<Array<ParsedCssColor | null>> {
    if (!page) throw new Error("probe page missing");
    return page.evaluate(
      ({ src, list }) =>
        list.map(
          (value) => new Function("value", src)(value) as ParsedCssColor | null,
        ),
      { src: PARSER_SRC, list: values },
    );
  }

  it(
    "resolves legacy, space, hex, and keyword syntax",
    async () => {
      const [black, half, percent, shortHex, longHex, transparent] =
        await resolve(
          "rgb(0, 0, 0)",
          "rgba(255, 255, 255, 0.5)",
          "rgb(100%, 0%, 0%)",
          "#fff",
          "#09090b",
          "transparent",
        );

      expect(black).toEqual({ rgb: [0, 0, 0], alpha: 1 });
      expect(half?.rgb).toEqual([255, 255, 255]);
      expect(half?.alpha).toBeCloseTo(0.5, 1);
      expect(percent).toEqual({ rgb: [255, 0, 0], alpha: 1 });
      expect(shortHex?.rgb).toEqual([255, 255, 255]);
      expect(longHex?.rgb).toEqual([9, 9, 11]);
      expect(transparent?.alpha).toBe(0);

      const [space, slash, percentAlpha] = await resolve(
        "rgb(255 0 0)",
        "rgb(39 39 42 / 0.5)",
        "rgba(9 9 11 / 50%)",
      );
      expect(space?.rgb).toEqual([255, 0, 0]);
      // A translucent color round-trips through the canvas's premultiplied
      // 8-bit store, so a channel can shift by one.
      [39, 39, 42].forEach((channel, index) => {
        expect(
          Math.abs((slash?.rgb[index] ?? 0) - channel),
        ).toBeLessThanOrEqual(1);
      });
      expect(slash?.alpha).toBeCloseTo(0.5, 1);
      expect(percentAlpha?.alpha).toBeCloseTo(0.5, 1);
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it(
    "delegates lab/oklab conversion to the browser",
    async () => {
      const [white, black, midGray, red] = await resolve(
        "lab(100% 0 0)",
        "lab(0% 0 0)",
        "lab(50% 0 0)",
        "lab(52.2319% 80.1093 67.2201)",
      );
      expect(white?.rgb).toEqual([255, 255, 255]);
      expect(black?.rgb).toEqual([0, 0, 0]);
      // CSS Color 4 reference: 50% lightness neutral gray ≈ #777.
      for (const channel of midGray?.rgb ?? [0, 0, 0]) {
        expect(Math.abs(channel - 119)).toBeLessThanOrEqual(3);
      }
      // CSS Color 4 spec example: this lab triple displays as red.
      expect(red?.rgb[0]).toBeGreaterThan(200);
      expect(red?.rgb[1]).toBeLessThan(100);

      const [okWhite, okGray, okAlpha] = await resolve(
        "oklab(1 0 0)",
        "oklab(0.5 0 0)",
        "oklab(100% 0 0 / 50%)",
      );
      expect(okWhite?.rgb).toEqual([255, 255, 255]);
      for (const channel of okGray?.rgb ?? [0, 0, 0]) {
        expect(Math.abs(channel - 99)).toBeLessThanOrEqual(6);
      }
      expect(okAlpha?.alpha).toBeCloseTo(0.5, 1);
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it(
    "resolves the color spaces the removed parser skipped",
    async () => {
      // These used to be unmeasurable — the point of asking the browser.
      const [hsl, oklch, p3, mixed] = await resolve(
        "hsl(0, 100%, 50%)",
        "oklch(0.5 0.1 200)",
        "color(display-p3 1 0 0)",
        "color-mix(in oklab, red 50%, blue)",
      );
      expect(hsl?.rgb).toEqual([255, 0, 0]);
      expect(oklch?.rgb).not.toBeNull();
      expect(p3?.rgb).not.toBeNull();
      expect(mixed?.rgb).not.toBeNull();
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it(
    "reads sRGB channels and percentages from color()",
    async () => {
      const [red, half, alphaZero] = await resolve(
        "color(srgb 1 0 0)",
        "color(srgb 100% 50% 0%)",
        "color(srgb 1 1 1 / 0)",
      );
      expect(red).toEqual({ rgb: [255, 0, 0], alpha: 1 });
      expect(half?.rgb).toEqual([255, 128, 0]);
      expect(alphaZero?.alpha).toBe(0);
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it(
    "clamps out-of-range channels and alpha",
    async () => {
      const [clamped, overAlpha, negativeAlpha] = await resolve(
        "rgb(300, -20, 12.6)",
        "rgb(9 9 11 / 2)",
        "rgb(9 9 11 / -1)",
      );
      expect(clamped).toEqual({ rgb: [255, 0, 13], alpha: 1 });
      expect(overAlpha?.alpha).toBe(1);
      expect(negativeAlpha?.alpha).toBe(0);
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it(
    "rejects values the browser cannot paint",
    async () => {
      const results = await resolve(
        "currentcolor",
        "not-a-color",
        "",
        "rgb(1, 2)",
        "inherit",
        "var(--brand)",
      );
      for (const result of results) {
        expect(result).toBeNull();
      }
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );

  it(
    "quantizes alpha to the canvas byte range",
    async () => {
      const [half] = await resolve("rgba(0, 0, 0, 0.5)");
      expect(half?.alpha).toBeGreaterThan(0.5 - ALPHA_TOLERANCE);
      expect(half?.alpha).toBeLessThan(0.5 + ALPHA_TOLERANCE);
    },
    PLAYWRIGHT_TEST_TIMEOUT_MS,
  );
});
