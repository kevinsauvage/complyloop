/**
 * CSS color resolution for runtime contrast measurement.
 *
 * `getComputedStyle` serializes colors differently per Chromium build
 * (legacy comma `rgb()` vs space syntax vs `lab()`/`oklab()`/`color()` for
 * `color-mix()` values), and measurement code that only understands legacy
 * syntax silently skips elements on some stacks — identical pages then yield
 * different findings per environment.
 *
 * Instead of re-implementing CSS Color 4 conversion, the color is painted on a
 * 1×1 canvas and the resulting pixel is read back: Chromium performs every
 * conversion (`lab`, `oklch`, `color(display-p3)`, `color-mix`, …) with the
 * code that paints the page, so the value measured is the value rendered.
 * Alpha is quantized to 1/255 by the canvas, and a translucent color's
 * channels round-trip through its premultiplied store (a channel can shift by
 * one) — both far below any contrast threshold this feeds.
 *
 * Pure + self-contained: everything lives INSIDE the exported function so
 * `parseCssColor.toString()` serializes complete (module-scope siblings would
 * be dangling references in the page — see browser-src-robustness conventions).
 */

export interface ParsedCssColor {
  rgb: [number, number, number];
  /** 0 (fully transparent) to 1 (opaque). */
  alpha: number;
}

export function parseCssColor(value: string): ParsedCssColor | null {
  const text = value.trim();
  if (text === "") return null;
  // `currentcolor` is the inherited text color, and the canvas has no element:
  // it would resolve to black and misreport the real ratio.
  if (text.toLowerCase() === "currentcolor") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  // An invalid `fillStyle` assignment is silently ignored, and `CSS.supports`
  // accepts values a canvas cannot paint (`inherit`, `var(--x)`). Assign over
  // two different colors: a value the canvas took reads back the same both
  // times; a rejected one leaves each sentinel in place.
  context.fillStyle = "#000000";
  context.fillStyle = text;
  const overBlack = context.fillStyle;
  context.fillStyle = "#ffffff";
  context.fillStyle = text;
  if (context.fillStyle !== overBlack) return null;

  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  return {
    rgb: [red ?? 0, green ?? 0, blue ?? 0],
    alpha: (alpha ?? 0) / 255,
  };
}
