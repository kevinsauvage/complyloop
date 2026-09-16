import { describe, expect, it } from "vitest";

import {
  foldAccents,
  matchesMultilingual,
  RUNTIME_MATCHES_SRC,
} from "../patterns/multilingual";
import { parseCssColor } from "./css-color";
import {
  BROWSER_CAPTCHA_MATCH_SRC,
  BROWSER_COLLECT_CAPTCHA_SRC,
  BROWSER_OBJECT_RECOGNITION_CAPTCHA_SRC,
  captchaCandidateMatchText,
  collectCaptchaCandidates,
  elementLooksLikeCaptcha,
  isObjectRecognitionCaptchaElement,
} from "./custom-checks/captcha-candidates";
import {
  accessibleNameOf,
  buildCssSelector,
  describeObscurer,
  escapeAttr,
  roleLabel,
} from "./custom-checks/dom-hit-rich";
import {
  BROWSER_HIT_CAPTURE_SRC,
  LOAD_HIT_CAPTURE_SRC,
  loadHitCapture,
} from "./custom-checks/hit-capture";
import { gapBetweenRects } from "./custom-checks/label-adjacent";
import {
  IS_LAYOUT_TABLE_SRC,
  isLayoutTable,
} from "./custom-checks/layout-table-linearization";
import {
  contrastRatio,
  parseRgb,
  relativeLuminance,
} from "./custom-checks/non-text-contrast";
import {
  selectorRef,
} from "./custom-checks/widget-keyboard-utils";
import { htmlSnippet } from "./dom-location";

type AnyFn = (...args: never[]) => unknown;

/**
 * Guards the Playwright browser-source injection against production bundling.
 *
 * Runtime probes assemble page scripts from `helperFn.toString()` fragments.
 * Locally (vitest/esbuild) those stringify to *named* declarations, which also
 * parse as bare statements — but the production bundler inlines cross-module
 * helpers as *anonymous* `function(...){...}` expressions. Any fragment sitting
 * in statement position then throws `SyntaxError: Function statements require
 * a function name` in the page and kills the whole runtime scan
 * (`assessment_runtime_skipped`, `pagesScanned: 0`), while every local test
 * stays green.
 *
 * Each test below re-checks an assembled source twice: as-is, and through
 * {@link productionShape} (only the interpolated helper sources anonymized —
 * literal template text such as the IIFE wrapper survives bundling verbatim).
 * Only `new Function` *construction* is exercised — compilation catches the
 * SyntaxError without executing page code, so no DOM or browser is needed.
 */

/** Strip one helper's name, as the production bundler does to `.toString()`. */
function anonymizeHelper(src: string): string {
  return src.replace(
    /(\basync\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/,
    "$1function(",
  );
}

/**
 * Model the production shape of an assembled source: the literal template
 * text is untouched, but every interpolated `helperFn.toString()` fragment
 * arrives anonymous.
 */
function productionShape(src: string, helpers: readonly AnyFn[]): string {
  let out = src;
  for (const fn of helpers) {
    const raw = fn.toString();
    out = out.split(raw).join(anonymizeHelper(raw));
  }
  return out;
}

/** Assembled IIFE sources are reconstituted as parenthesized expressions. */
function expectExpressionSource(
  src: string,
  label: string,
  helpers: readonly AnyFn[],
): void {
  for (const variant of [src, productionShape(src, helpers)]) {
    expect(
      () => new Function(`return (${variant})`),
      `${label} must parse as an expression (production shape)`,
    ).not.toThrow();
  }
}

const HIT_CAPTURE_HELPERS = [
  htmlSnippet,
  selectorRef,
  escapeAttr,
  roleLabel,
  accessibleNameOf,
  buildCssSelector,
  describeObscurer,
] as const;

describe("browser source survives bundler anonymization", () => {
  it("productionShape() models production (non-vacuous simulation)", () => {
    // If helpers ever stop carrying names in dev, the simulation is vacuous
    // and the tests below would pass without proving anything.
    expect(productionShape(BROWSER_HIT_CAPTURE_SRC, HIT_CAPTURE_HELPERS)).not.toBe(
      BROWSER_HIT_CAPTURE_SRC,
    );
    expect(
      productionShape(RUNTIME_MATCHES_SRC, [foldAccents, matchesMultilingual]),
    ).not.toBe(RUNTIME_MATCHES_SRC);
  });

  it("hit-capture + loader sources reconstitute as expressions", () => {
    expectExpressionSource(
      BROWSER_HIT_CAPTURE_SRC,
      "BROWSER_HIT_CAPTURE_SRC",
      HIT_CAPTURE_HELPERS,
    );
    expectExpressionSource(LOAD_HIT_CAPTURE_SRC, "LOAD_HIT_CAPTURE_SRC", [
      loadHitCapture,
    ]);
  });

  it("captcha sources reconstitute as expressions", () => {
    expectExpressionSource(BROWSER_CAPTCHA_MATCH_SRC, "BROWSER_CAPTCHA_MATCH_SRC", [
      captchaCandidateMatchText,
      elementLooksLikeCaptcha,
    ]);
    expectExpressionSource(
      BROWSER_OBJECT_RECOGNITION_CAPTCHA_SRC,
      "BROWSER_OBJECT_RECOGNITION_CAPTCHA_SRC",
      [isObjectRecognitionCaptchaElement],
    );
    expectExpressionSource(
      BROWSER_COLLECT_CAPTCHA_SRC,
      "BROWSER_COLLECT_CAPTCHA_SRC",
      [collectCaptchaCandidates],
    );
  });

  it("layout-table source reconstitutes as an expression", () => {
    expectExpressionSource(IS_LAYOUT_TABLE_SRC, "IS_LAYOUT_TABLE_SRC", [
      isLayoutTable,
    ]);
  });

  it("multilingual matcher body parses as a function body", () => {
    // Mirrors `new Function("pattern", "text", RUNTIME_MATCHES_SRC)`.
    for (const variant of [
      RUNTIME_MATCHES_SRC,
      productionShape(RUNTIME_MATCHES_SRC, [foldAccents, matchesMultilingual]),
    ]) {
      expect(
        () => new Function("pattern", "text", variant),
        "RUNTIME_MATCHES_SRC must parse as a function body (production shape)",
      ).not.toThrow();
    }
  });

  it("contrast math bodies parse as function bodies", () => {
    // Mirrors the `new Function` bodies in non-text-contrast.ts.
    const parseBody =
      `const parseRgb = (${anonymizeHelper(parseRgb.toString())}); return parseRgb(value);`;
    const ratioBody =
      `const relativeLuminance = (${anonymizeHelper(relativeLuminance.toString())}); ` +
      `const contrastRatio = (${anonymizeHelper(contrastRatio.toString())}); return contrastRatio(a, b);`;
    expect(() => new Function("value", parseBody)).not.toThrow();
    expect(() => new Function("a", "b", ratioBody)).not.toThrow();
  });

  it("css color parser body parses as a function body", () => {
    // Mirrors the `new Function` bodies in non-text-contrast.ts and
    // forced-colors.ts. The parser nests all helpers so the serialized
    // source is complete (no module-scope dangling references).
    const body =
      `const parseCssColor = (${anonymizeHelper(parseCssColor.toString())}); return parseCssColor(value);`;
    expect(() => new Function("value", body)).not.toThrow();
    // Self-containment: the serialized source must not reference imports.
    expect(anonymizeHelper(parseCssColor.toString())).not.toMatch(
      /__vite_ssr_import__|__vite_ssr_dynamic_import__|require\(/,
    );
  });

  it("label gap body parses as a function body", () => {
    // Mirrors the `new Function` body in label-adjacent.ts.
    const body =
      `const gapBetweenRects = (${anonymizeHelper(gapBetweenRects.toString())}); return gapBetweenRects(a, b);`;
    expect(() => new Function("a", "b", body)).not.toThrow();
  });

  it("leaf helpers stay self-contained (no cross-closure references)", () => {
    // Anonymization must not hide a helper that closes over module scope:
    // such a source parses but throws ReferenceError in the page.
    for (const [label, fn] of [
      ["foldAccents", foldAccents],
      ["matchesMultilingual", matchesMultilingual],
      ["parseRgb", parseRgb],
      ["selectorRef", selectorRef],
    ] as const) {
      const src = anonymizeHelper(fn.toString());
      expect(src, `${label} must not reference imports`).not.toMatch(
        /__vite_ssr_import__|__vite_ssr_dynamic_import__|require\(/,
      );
    }
  });
});
