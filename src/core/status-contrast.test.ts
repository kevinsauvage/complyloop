import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Contrast gate for the light-mode status tokens.
 *
 * `STATUS_TONE_BADGE` renders token-colored text on a 25% token tint, so this
 * test parses the `:root` oklch values out of `globals.css` and asserts the
 * text-on-tint pair hits WCAG AA 4.5:1 — and that large stat numerals on the
 * faint QuickStatTile washes (~7%) hit 3:1. If you retune a token, run this
 * test: it fails before your users squint.
 */

const TOKEN_NAMES = [
  "signal",
  "status-passed",
  "status-failed",
  "status-review",
  "status-na",
  "status-unverifiable",
] as const;

function readRootBlock(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const css = readFileSync(join(here, "..", "app", "globals.css"), "utf8");
  const root = css.match(/:root\s*{([^}]*)}/);
  if (!root) throw new Error("globals.css has no :root block");
  return root[1];
}

function parseOklch(block: string, name: string): [number, number, number] {
  const match = block.match(
    new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
  );
  if (!match) throw new Error(`token --${name} not found in :root`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function oklchToSrgb([L, C, H]: [number, number, number]): [
  number,
  number,
  number,
] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.291485548 * b;
  const l3 = l ** 3;
  const m3 = m ** 3;
  const s3 = s ** 3;
  const r = 4.0767416621 * l3 - 3.3077115904 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  const gamma = (x: number) => {
    const v = Math.max(0, x);
    return v > 0.0031308 ? 1.055 * v ** (1 / 2.4) - 0.055 : 12.92 * v;
  };
  return [gamma(r), gamma(g), gamma(bl)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function mix(
  fg: [number, number, number],
  bg: [number, number, number],
  t: number,
): [number, number, number] {
  return [fg[0] * t + bg[0] * (1 - t), fg[1] * t + bg[1] * (1 - t), fg[2] * t + bg[2] * (1 - t)];
}

function contrast(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("light-mode status token contrast", () => {
  const block = readRootBlock();
  const card = oklchToSrgb(parseOklch(block, "card"));

  for (const name of TOKEN_NAMES) {
    it(`--${name} badge text on its 25% tint hits 4.5:1`, () => {
      const token = oklchToSrgb(parseOklch(block, name));
      const tint = mix(token, card, 0.25);
      expect(contrast(token, tint)).toBeGreaterThanOrEqual(4.5);
    });

    it(`--${name} large numerals on a 7% wash hit 3:1`, () => {
      const token = oklchToSrgb(parseOklch(block, name));
      const wash = mix(token, card, 0.07);
      expect(contrast(token, wash)).toBeGreaterThanOrEqual(3);
    });
  }
});
