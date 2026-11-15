/**
 * Runtime orchestration entry (stage 2 of the analysis pipeline): SSRF-safe
 * navigation → axe + custom probes + html-validate + link checks →
 * `RuntimeScanResult`. Engines stay behind `scanRuntime` (injectable via
 * `RuntimePageScanner` for tests) — server code never imports
 * `custom-checks/*` or `site-level/*` internals. See
 * `packages/analysis-core/README.md`.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { Page } from "playwright-core";

import { PublicError } from "../contract/public-error.ts";
import { type AxeViolationLike } from "./findings.ts";
import { TARGET_SIZE_AXE_RULE } from "./viewport-conditions.ts";

/**
 * Resolve axe.min.js from node_modules at runtime.
 * Do not import `axe-core`'s `source` string — Next/webpack rewrites
 * `typeof module` inside it, which throws in the browser (`module is not defined`).
 */
export function resolveAxeMinJsPath(): string {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return require.resolve("axe-core/axe.min.js");
}

export async function axeTargetSizeViolations(
  page: Page,
): Promise<AxeViolationLike[]> {
  const axe = await runAxeOnPage(page, { runOnly: [TARGET_SIZE_AXE_RULE] });
  return axe.violations.filter((v) => v.id === TARGET_SIZE_AXE_RULE);
}

async function axePresentOnPage(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      typeof (window as { axe?: { run?: unknown } }).axe?.run === "function",
  );
}

async function ensureAxeOnPage(page: Page): Promise<void> {
  if (await axePresentOnPage(page)) return;
  // Evaluate the engine as an expression instead of appending a <script>
  // element. Only DOM-inserted scripts are governed by the page's
  // `script-src`; `page.evaluate` goes through the debugger protocol, which
  // CSP does not restrict. Verified against strict (`script-src 'self'`),
  // nonce-based and hash-only policies — `addScriptTag` is blocked by all
  // three. This keeps the audited page's policy fully enforced (no
  // `bypassCSP`), so hosts the site blocks — analytics, tag managers,
  // personalisation widgets — stay blocked and the DOM still matches what
  // real users get. Same reason the `new Function` probes in
  // `custom-checks/hit-capture-evaluate.ts` survive strict CSP.
  await page.evaluate(readFileSync(resolveAxeMinJsPath(), "utf8"));
  if (!(await axePresentOnPage(page))) {
    throw new PublicError(
      "Could not initialize the accessibility engine on the audited page.",
    );
  }
}

/**
 * Load axe from disk and analyze the current page (main frame). Do not switch
 * to `@axe-core/playwright`: it injects `axe-core`'s `source` string, which
 * Next/webpack rewrites (`module is not defined`) — see `resolveAxeMinJsPath`.
 */
export async function runAxeOnPage(
  page: Page,
  options?: { runOnly?: ReadonlyArray<string> },
): Promise<{
  violations: AxeViolationLike[];
  incomplete: AxeViolationLike[];
}> {
  await ensureAxeOnPage(page);
  const runOnly = options?.runOnly;
  const results = await page.evaluate(
    async (
      rules,
    ): Promise<{
      violations: AxeViolationLike[];
      incomplete?: AxeViolationLike[];
    }> => {
      const axe = (
        window as unknown as {
          axe: {
            run: (
              context: Document,
              options: {
                iframes: boolean;
                runOnly?: { type: "rule"; values: string[] };
              },
            ) => Promise<{
              violations: AxeViolationLike[];
              incomplete?: AxeViolationLike[];
            }>;
          };
        }
      ).axe;
      return axe.run(document, {
        iframes: true,
        ...(rules && rules.length > 0
          ? { runOnly: { type: "rule", values: [...rules] } }
          : {}),
      });
    },
    runOnly ? [...runOnly] : undefined,
  );

  return {
    violations: results.violations,
    incomplete: results.incomplete ?? [],
  };
}
