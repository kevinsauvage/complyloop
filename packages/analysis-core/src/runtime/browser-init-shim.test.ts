import { describe, expect, it } from "vitest";

import { BROWSER_INIT_SHIM_SRC } from "./browser-init-shim";
import { parseCssColor } from "./css-color";

/**
 * The page-init shim is what keeps tsx/esbuild-compiled probe sources alive
 * in the page: keepNames wraps nested declarations in `__name()` calls whose
 * file-scoped definition never travels with `fn.toString()` fragments or
 * `page.evaluate` closures (SWC/webpack stacks never emit it — the shim is a
 * no-op there). These tests execute sources the way the page would, without
 * needing a browser: without the shim the reference dies, with it the
 * behavior is identical.
 */
describe("browser init shim", () => {
  it("executes a keepNames-style nested-helper source", () => {
    const source = `function outer(){function inner(n){return n*2;}__name(inner,"inner");return inner(21);}__name(outer,"outer");return outer();`;
    expect(() => new Function(source)()).toThrow(ReferenceError);
    expect(new Function(`${BROWSER_INIT_SHIM_SRC};${source}`)()).toBe(42);
  });

  it("executes a real serialized probe helper unchanged", () => {
    const run = (prelude: string) =>
      new Function(
        `${prelude};const parseCssColor = (${parseCssColor.toString()});return parseCssColor("rgb(255, 0, 0)");`,
      )() as unknown;
    const withShim = run(BROWSER_INIT_SHIM_SRC) as {
      rgb: readonly number[];
    };
    expect(withShim.rgb).toEqual([255, 0, 0]);
    // A clean (SWC-style, helper-free) source must not depend on the shim.
    const withoutHelpers = parseCssColor
      .toString()
      .replace(/__name\([A-Za-z_$][\w$]*,"[^"]*"\);?/g, "");
    expect(
      new Function(
        `const parseCssColor = (${withoutHelpers});return parseCssColor("rgb(255, 0, 0)");`,
      )(),
    ).toEqual(withShim);
  });

  it("is bundler-proof by construction", () => {
    expect(BROWSER_INIT_SHIM_SRC).not.toMatch(/function\s+[A-Za-z_$]/);
    expect(() => new Function(BROWSER_INIT_SHIM_SRC)).not.toThrow();
  });
});
