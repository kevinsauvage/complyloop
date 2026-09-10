import { createRequire } from "node:module";
import path from "node:path";
import type { Browser, Page } from "playwright";
import { PublicError, publicMessage } from "../contract/public-error.ts";
import { classifyRuntimeScanError } from "./scan-error.ts";
import type { RawFinding } from "../types.ts";
import {
  findingsFromAxePages,
  joinRuntimeUrl,
  runtimeRoutesFor,
  siteLevelFindingsFromPages,
  type AxeViolationLike,
  type RuntimeScanPageResult,
  type RuntimeScanResult,
} from "./findings.ts";
import { capturePageSnapshot } from "./site-level/snapshot.ts";
import {
  allowRuntimeNavigation,
  assertSafeRuntimeUrl,
  assertStableRuntimeDns,
  createRedirectHopGuard,
  TOO_MANY_REDIRECTS_MESSAGE,
  UNSAFE_RUNTIME_URL_MESSAGE,
  type DnsLookup,
} from "./url-safety.ts";
import { runCustomRuntimeChecks, runThemeSensitiveCustomChecks } from "./custom-checks/index.ts";
import { htmlValidateFindingsForPage } from "./html-validate-runtime.ts";
import { brokenLinkFindingsForUrls } from "./site-level/link-check.ts";
import {
  aggregateApplicabilityObservations,
  applicabilityObservationsForPage,
} from "./applicability.ts";
import { maxRuntimePages } from "../contract/assessment-limits.ts";
import {
  conditionLabel,
  conditionSpecificFindings,
  conditionSpecificViolations,
  emulationForCondition,
  RESET_EMULATION,
  THEME_SENSITIVE_AXE_RULES,
  type BrowserCondition,
} from "./theme-conditions.ts";
import {
  COARSE_POINTER_LABEL,
  MOBILE_TARGET_SIZE_LABEL,
  MOBILE_VIEWPORT,
  TARGET_SIZE_AXE_RULE,
  emulateCoarsePointer,
} from "./viewport-conditions.ts";
import { gotoForRuntimeAudit, runtimePageMatchesAuditedUrl } from "./runtime-navigation.ts";

export type RuntimePageScanner = (
  urls: ReadonlyArray<string>,
) => Promise<RuntimeScanPageResult[]>;

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser) {
    const { chromium } = await import("playwright");
    sharedBrowser = await chromium.launch({ headless: true });
    process.on("exit", () => {
      sharedBrowser?.close().catch(() => {});
    });
  }
  return sharedBrowser;
}

/**
 * Resolve axe.min.js from node_modules at runtime.
 * Do not import `axe-core`'s `source` string — Next/webpack rewrites
 * `typeof module` inside it, which throws in the browser (`module is not defined`).
 */
export function resolveAxeMinJsPath(): string {
  const require = createRequire(path.join(process.cwd(), "package.json"));
  return require.resolve("axe-core/axe.min.js");
}

async function axeTargetSizeViolations(page: Page): Promise<AxeViolationLike[]> {
  const axe = await runAxeOnPage(page, { runOnly: [TARGET_SIZE_AXE_RULE] });
  return axe.violations.filter((v) => v.id === TARGET_SIZE_AXE_RULE);
}

async function ensureAxeOnPage(page: Page): Promise<void> {
  const present = await page.evaluate(
    () =>
      typeof (window as { axe?: { run?: unknown } }).axe?.run === "function",
  );
  if (present) return;
  await page.addScriptTag({ path: resolveAxeMinJsPath() });
}

/**
 * Inject axe from disk and analyze the current page (main frame).
 * Do not switch to `@axe-core/playwright`: it injects `axe-core`'s `source`
 * string by default, which Next/webpack rewrites (`module is not defined`).
 * Disk `axe.min.js` plus our SSRF `context.route` interceptor is the adapter.
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

/**
 * Playwright + axe-core scanner with DNS/redirect SSRF checks on every request.
 */
function createPlaywrightAxeScanner(options?: {
  lookup?: DnsLookup;
  browserConditions?: ReadonlyArray<BrowserCondition>;
}): RuntimePageScanner {
  const lookupOptions = options?.lookup ? { lookup: options.lookup } : undefined;
  const conditions = options?.browserConditions ?? [];

  return async (urls) => {
    const browser = await getBrowser();
    const context = await browser.newContext();
    const pages: RuntimeScanPageResult[] = [];
    let blockedReason: string | null = null;
    let hopGuard = createRedirectHopGuard();

    // Intercept every hop (including redirects) before the browser connects.
    await context.route("**/*", async (route) => {
      const request = route.request();
      try {
        hopGuard.countHop(request.resourceType());
      } catch (error) {
        blockedReason =
          error instanceof PublicError
            ? error.message
            : TOO_MANY_REDIRECTS_MESSAGE;
        await route.abort("blockedbyclient");
        return;
      }
      const decision = await allowRuntimeNavigation(
        request.url(),
        lookupOptions,
      );
      if (!decision.ok) {
        blockedReason = decision.message;
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });

    try {
      for (const url of urls) {
        blockedReason = null;
        hopGuard = createRedirectHopGuard();
        // Re-check near navigation (narrows the DNS rebinding window).
        const precheck = await allowRuntimeNavigation(url, lookupOptions);
        if (!precheck.ok) {
          throw new PublicError(precheck.message);
        }
        const page = await context.newPage();
        try {
          try {
            // Re-resolve DNS immediately before goto and reject address
            // changes to shrink the rebinding TOCTOU window.
            await assertStableRuntimeDns(url, lookupOptions);
            await gotoForRuntimeAudit(page, url);
          } catch (error) {
            if (blockedReason) throw new PublicError(blockedReason);
            throw error;
          }
          if (blockedReason) {
            throw new PublicError(blockedReason);
          }
          const results = await runAxeOnPage(page);
          const customChecks = await runCustomRuntimeChecks(page, url);
          const customFindings = customChecks.findings;
          // Rendered pass: validate the generated DOM. Serialize on
          // the open page (no extra browser cost) and validate in-process.
          const snapshot = await capturePageSnapshot(page, url);
          const applicabilityObservations =
            await applicabilityObservationsForPage(page, url);
          const hasDoctype = await page.evaluate(
            () => document.doctype !== null,
          );
          let htmlValidateFindings: RawFinding[] = [];
          let pageHtmlValidateRan = false;
          try {
            htmlValidateFindings = await htmlValidateFindingsForPage(page, url);
            pageHtmlValidateRan = true;
          } catch {
            // Non-fatal: axe + custom findings are still valid evidence.
          }

          let violations = hasDoctype
            ? [...results.violations]
            : [
              ...results.violations,
              {
                id: "html-has-doctype",
                impact: "moderate",
                description:
                  "The document does not declare a document type.",
                help: "Each page must have a doctype so browsers parse it in standards mode.",
                nodes: [
                  {
                    html: "<html>",
                    target: ["html"],
                  },
                ],
              },
            ];

          const defaultTargetSize = await axeTargetSizeViolations(page);
          violations = [...violations, ...defaultTargetSize];
          violations = await collectViewportAndPointerViolations(page, violations);

          const { conditionViolations, conditionCustomFindings, conditionProbeFailures } =
            await collectBrowserConditionFindings(
              page,
              url,
              conditions,
              violations,
              customFindings,
            );

          pages.push({
            url,
            loadedCleanly: true,
            finalUrl: page.url(),
            violations: [...violations, ...conditionViolations],
            incomplete: results.incomplete,
            customFindings: [...customFindings, ...conditionCustomFindings],
            htmlValidateFindings,
            htmlValidateRan: pageHtmlValidateRan,
            snapshot,
            applicabilityObservations,
            probeFailures: [
              ...customChecks.probeFailures,
              ...conditionProbeFailures,
            ],
          });
        } finally {
          await page.close();
        }
      }
    } finally {
      await context.close();
    }
    return pages;
  };
}

export interface ScanRuntimeOptions {
  runtimeBaseUrl?: string;
  runtimeRoutes?: string[];
  /** Browser conditions to re-audit theme-sensitive checks under (default none). */
  browserConditions?: ReadonlyArray<BrowserCondition>;
  /** Injected in tests; defaults to Playwright + axe. */
  scanner?: RuntimePageScanner;
  /** Injected DNS lookup for tests. */
  lookup?: DnsLookup;
}

/**
 * Audits configured routes under `runtimeBaseUrl`.
 * Returns empty findings (with error) when the URL is missing or unreachable.
 */
export async function scanRuntime(
  options: ScanRuntimeOptions,
): Promise<RuntimeScanResult> {
  const routes = runtimeRoutesFor(options);
  const base = options.runtimeBaseUrl?.trim();
  if (!base || routes.length === 0) {
    return { findings: [], pagesScanned: 0 };
  }
  const lookup = options.lookup ? { lookup: options.lookup } : undefined;

  try {
    await assertSafeRuntimeUrl(base, lookup);
  } catch (error) {
    return {
      findings: [],
      pagesScanned: 0,
      error: publicMessage(error, UNSAFE_RUNTIME_URL_MESSAGE),
    };
  }

  const urls = routes.map((route) => joinRuntimeUrl(base, route));
  for (const url of urls) {
    try {
      await assertSafeRuntimeUrl(url, lookup);
    } catch (error) {
      return {
        findings: [],
        pagesScanned: 0,
        error: publicMessage(error, UNSAFE_RUNTIME_URL_MESSAGE),
      };
    }
  }
  if (urls.length > maxRuntimePages()) {
    return {
      findings: [],
      pagesScanned: 0,
      error: `Runtime audit exceeds the ${maxRuntimePages()} page quota. Reduce configured routes or raise ASSESSMENT_MAX_RUNTIME_PAGES.`,
    };
  }
  const scanner =
    options.scanner ??
    createPlaywrightAxeScanner({
      lookup: options.lookup,
      browserConditions: options.browserConditions,
    });
  try {
    const pages = await scanner(urls);
    const siteLevelChecksRan = pages.length >= 2;
    const htmlValidateRan = pages.some((page) => page.htmlValidateRan === true);
    const linkFindings =
      pages.length > 0
        ? await brokenLinkFindingsForUrls(urls, {
          lookup: options.lookup,
          recurse: true,
          maxUrls: maxRuntimePages(),
          snapshots: pages
            .map((page) => page.snapshot)
            .filter((snapshot) => snapshot !== undefined),
        })
        : [];
    const linkCheckRan = pages.length > 0;
    const findings = [
      ...findingsFromAxePages(pages),
      ...(siteLevelChecksRan ? siteLevelFindingsFromPages(pages) : []),
      ...linkFindings,
    ];
    const applicabilityFacts = aggregateApplicabilityObservations(pages);
    const probeFailures = [
      ...new Set(pages.flatMap((page) => page.probeFailures ?? [])),
    ];
    return {
      findings,
      pagesScanned: pages.length,
      siteLevelChecksRan,
      htmlValidateRan,
      linkCheckRan,
      applicabilityFacts,
      probeFailures,
    };
  } catch (error) {
    return {
      findings: [],
      pagesScanned: 0,
      error: classifyRuntimeScanError(error),
    };
  }
}

async function collectViewportAndPointerViolations(
  page: Page,
  baseViolations: AxeViolationLike[],
): Promise<AxeViolationLike[]> {
  let violations = [...baseViolations];
  const defaultViewport = page.viewportSize();
  await page.setViewportSize(MOBILE_VIEWPORT);
  try {
    violations = [
      ...violations,
      ...conditionSpecificViolations(
        violations,
        await axeTargetSizeViolations(page),
        MOBILE_TARGET_SIZE_LABEL,
      ),
    ];
  } finally {
    if (defaultViewport) {
      await page.setViewportSize(defaultViewport);
    }
  }

  const coarseTargetSize = await emulateCoarsePointer(page, () =>
    axeTargetSizeViolations(page),
  );
  return [
    ...violations,
    ...conditionSpecificViolations(
      violations,
      coarseTargetSize,
      COARSE_POINTER_LABEL,
    ),
  ];
}

async function collectBrowserConditionFindings(
  page: Page,
  url: string,
  conditions: ReadonlyArray<BrowserCondition>,
  baseViolations: AxeViolationLike[],
  baseCustomFindings: RawFinding[],
): Promise<{
  conditionViolations: AxeViolationLike[];
  conditionCustomFindings: RawFinding[];
  conditionProbeFailures: string[];
}> {
  const conditionViolations: AxeViolationLike[] = [];
  const conditionCustomFindings: RawFinding[] = [];
  const conditionProbeFailures: string[] = [];
  for (const condition of conditions) {
    await page.emulateMedia(emulationForCondition(condition));
    try {
      const axeResult = await runAxeOnPage(page);
      const themeAxe = axeResult.violations.filter((v) =>
        THEME_SENSITIVE_AXE_RULES.has(v.id),
      );
      const themeCustom = await runThemeSensitiveCustomChecks(page, url);
      const label = conditionLabel(condition);
      conditionViolations.push(
        ...conditionSpecificViolations(baseViolations, themeAxe, label),
      );
      conditionCustomFindings.push(
        ...conditionSpecificFindings(baseCustomFindings, themeCustom.findings, label),
      );
      conditionProbeFailures.push(...themeCustom.probeFailures);
    } finally {
      await page.emulateMedia(RESET_EMULATION);
    }
  }
  return { conditionViolations, conditionCustomFindings, conditionProbeFailures };
}

/**
 * Re-checks whether a specific DOM finding still fails on its URL.
 * Returns true when the same check + selector (or snippet) is still present,
 * and fails closed (returns true) whenever the page cannot be shown to have
 * rendered cleanly — an unreachable/blocked page or an empty scan must never
 * allow "verified".
 */
export async function runtimeViolationStillPresent(
  finding: Pick<RawFinding, "checkId" | "location">,
  scanner: RuntimePageScanner = createPlaywrightAxeScanner(),
): Promise<boolean> {
  if (finding.location.kind !== "dom") {
    throw new PublicError(
      "Runtime verification requires a finding with a DOM location.",
    );
  }
  const url = finding.location.url;
  const selector = finding.location.selector;
  const snippet = finding.location.snippet;

  let pages: RuntimeScanPageResult[];
  try {
    await assertSafeRuntimeUrl(url);
    pages = await scanner([url]);
  } catch {
    // Unreachable / blocked / scan failure: we cannot prove the fix, so the
    // violation is treated as still present (fail closed — never verified).
    return true;
  }
  // A page that rendered nothing also cannot be verified clean.
  if (pages.length === 0) return true;
  if (pages.some((candidate) => candidate.loadedCleanly !== true)) return true;
  if (
    pages.some(
      (candidate) =>
        !runtimePageMatchesAuditedUrl(candidate.finalUrl ?? candidate.url, url),
    )
  ) {
    return true;
  }

  const raw = findingsFromAxePages(pages);
  return raw.some(
    (candidate) =>
      candidate.checkId === finding.checkId &&
      candidate.location.kind === "dom" &&
      (candidate.location.selector === selector ||
        candidate.location.snippet === snippet),
  );
}
