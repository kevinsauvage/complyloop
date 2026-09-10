import { describe, expect, it } from "vitest";
import {
  REPORT_SEVERITY_COLORS,
  REPORT_TONE_COLORS,
  type ReportColorPair,
} from "./report-colors";

/**
 * Parity gate between the standalone report hex palette and the app
 * `STATUS_TONE_BADGE` tokens: every report pair must hold WCAG AA 4.5:1, the
 * same bar as the in-app badge gate (`src/core/status-contrast.test.ts`).
 */

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("report palette parity with app status tokens", () => {
  const entries: Array<[string, ReportColorPair]> = [
    ...Object.entries(REPORT_TONE_COLORS),
    ...Object.entries(REPORT_SEVERITY_COLORS),
  ];

  for (const [name, pair] of entries) {
    it(`${name} fg-on-bg hits 4.5:1`, () => {
      expect(contrast(pair.fg, pair.bg)).toBeGreaterThanOrEqual(4.5);
    });
  }
});
