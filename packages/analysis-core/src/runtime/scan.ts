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

import type { Browser, Page } from "playwright-core";

import { maxRuntimePages } from "../contract/assessment-limits.ts";
import { PublicError, publicMessage } from "../contract/public-error.ts";
import type { RawFinding } from "../types.ts";
import {
  aggregateApplicabilityObservations,
  applicabilityObservationsForPage,
} from "./applicability.ts";
import {
  runCustomRuntimeChecks,
  runThemeSensitiveCustomChecks,
} from "./custom-checks/index.ts";
import {
  type AxeViolationLike,
  findingsFromAxePages,
  joinRuntimeUrl,
  type RuntimePageFailure,
  runtimeRoutesFor,
  type RuntimeScanPageResult,
  type RuntimeScanResult,
  siteLevelFindingsFromPages,
} from "./findings.ts";
import { htmlValidateFindingsForPage } from "./html-validate-runtime.ts";
import {
  gotoForRuntimeAudit,
  runtimePageMatchesAuditedUrl,
} from "./runtime-navigation.ts";
import { classifyRuntimeScanError } from "./scan-error.ts";
import { brokenLinkFindingsForUrls } from "./site-level/link-check.ts";
import { capturePageSnapshot } from "./site-level/snapshot.ts";
import {
  type BrowserCondition,
  conditionLabel,
  conditionSpecificFindings,
  conditionSpecificViolations,
  emulationForCondition,
  RESET_EMULATION,
  THEME_SENSITIVE_AXE_RULES,
} from "./theme-conditions.ts";
import {
  allowRuntimeNavigation,
  assertSafeRuntimeUrl,
  assertStableRuntimeDns,
  createCachedDnsLookup,
  createRedirectHopGuard,
  type DnsLookup,
  TOO_MANY_REDIRECTS_MESSAGE,
  UNSAFE_RUNTIME_URL_MESSAGE,
} from "./url-safety.ts";
import {
  COARSE_POINTER_LABEL,
  emulateCoarsePointer,
  MOBILE_TARGET_SIZE_LABEL,
  MOBILE_VIEWPORT,
  TARGET_SIZE_AXE_RULE,
} from "./viewport-conditions.ts";

export type RuntimePageScanner = (urls: ReadonlyArray<string>) => Promise<{
  pages: RuntimeScanPageResult[];
  /** Per-page failures contained by the loop — sibling results are kept. */
  pageFailures: RuntimePageFailure[];
}>;

let sharedBrowser: Browser | null = null;

/**
 * Set when teardown timed out: the cached browser may hold a leaked context,
 * so the next scan launches fresh instead of reusing it. The leak is
 * container-lifetime-bounded (serverless discards the whole process).
 */
let sharedBrowserTainted = false;

/**
 * Teardown must never sink a scan whose findings are already collected:
 * `page.close()` / `context.close()` have waited minutes on pages with open
 * connections. Bound the wait, warn, and continue with what was collected.
 */
const TEARDOWN_TIMEOUT_MS = 15_000;

async function closeTeardown(
  label: "page" | "context",
  closing: Promise<void>,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      closing,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} close timed out`)),
          TEARDOWN_TIMEOUT_MS,
        );
      }),
    ]);
  } catch {
    sharedBrowserTainted = true;
    console.warn(
      `[warning] runtime ${label} close timed out; continuing with collected findings.`,
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Worker-script teardown: close the cached browser so a long-lived process
 * can exit. Serverless never needs this (the container dies with the
 * invocation); the GitHub Actions executor hangs on the browser child
 * process after the batch summary prints without it. Bounded like
 * page/context teardown, never throws.
 */
export async function closeRuntimeBrowser(): Promise<void> {
  const browser = sharedBrowser;
  sharedBrowser = null;
  sharedBrowserTainted = false;
  if (!browser) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      browser.close(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("browser close timed out")),
          TEARDOWN_TIMEOUT_MS,
        );
      }),
    ]);
  } catch {
    console.warn(
      "[warning] runtime browser close timed out; continuing to exit.",
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Runtime audits run on the GitHub Actions executor, which installs its own
 * Playwright Chromium (`npm run playwright:install`); local dev does the same.
 * There is no serverless-browser path — nothing Vercel-reachable imports this
 * module (see `docs/vercel.md`).
 */
async function getBrowser(): Promise<Browser> {
  if (sharedBrowserTainted) {
    // A previous teardown timed out and may have leaked a context — do not
    // reuse this browser. No close attempt: close is what hung last time.
    sharedBrowser = null;
    sharedBrowserTainted = false;
  }
  if (!sharedBrowser) {
    console.info("[progress] runtime browser launch started");
    const { chromium } = await import("playwright-core");
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

async function axeTargetSizeViolations(
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

/**
 * Playwright + axe-core scanner with DNS/redirect SSRF checks on every request.
 */
function createPlaywrightAxeScanner(options?: {
  lookup?: DnsLookup;
  browserConditions?: ReadonlyArray<BrowserCondition>;
}): RuntimePageScanner {
  const lookupOptions = options?.lookup
    ? { lookup: options.lookup }
    : undefined;
  const conditions = options?.browserConditions ?? [];

  return async (urls) => {
    const browser = await getBrowser();
    const context = await browser.newContext();
    // Per-stage wall-clock attribution for production slowness (see the
    // `[timing]` line before `return pages`): accumulates across pages.
    const stageMs: Record<string, number> = {};
    async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const start = Date.now();
      try {
        return await fn();
      } finally {
        stageMs[label] = (stageMs[label] ?? 0) + Date.now() - start;
      }
    }
    // Cache DNS per host for this scan: the interceptor runs for every
    // subresource, while the pre-navigation/rebinding checks below keep using
    // the uncached lookup on purpose.
    const navigationLookupOptions = {
      lookup: createCachedDnsLookup(options?.lookup),
    };
    const pages: RuntimeScanPageResult[] = [];
    const pageFailures: RuntimePageFailure[] = [];
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
        navigationLookupOptions,
      );
      if (!decision.ok) {
        blockedReason = decision.message;
        await route.abort("blockedbyclient");
        return;
      }
      await route.continue();
    });

    try {
      for (const [index, url] of urls.entries()) {
        // Per-page marker with the query stripped (preview tokens): the last
        // line before a timeout names the hanging page.
        console.info(
          `[progress] runtime page ${index + 1}/${urls.length} started ${url.replace(/\?[^\s"'<>]*/g, "")}`,
        );
        // One page must never sink its siblings: every per-page failure
        // (navigation, axe crash, blocked request, …) is contained below and
        // the loop continues. `page` stays null until the browser hands one
        // over, so teardown below never touches an unopened page.
        let page: Page | null = null;
        try {
          blockedReason = null;
          hopGuard = createRedirectHopGuard();
          // Re-check near navigation (narrows the DNS rebinding window).
          const precheck = await allowRuntimeNavigation(url, lookupOptions);
          if (!precheck.ok) {
            throw new PublicError(precheck.message);
          }
          page = await context.newPage();
          // Fresh const for narrowing: `page` stays nullable for the
          // `finally` teardown below, but everything past this point
          // holds a live page.
          const currentPage: Page = page;
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
          const results = await timed("axe", () => runAxeOnPage(currentPage));
          const customChecks = await timed("custom", () =>
            runCustomRuntimeChecks(currentPage, url),
          );
          const customFindings = customChecks.findings;
          // Rendered pass: validate the generated DOM. Serialize on
          // the open page (no extra browser cost) and validate in-process.
          const otherStart = Date.now();
          const snapshot = await capturePageSnapshot(currentPage, url);
          const applicabilityObservations =
            await applicabilityObservationsForPage(currentPage, url);
          const hasDoctype = await currentPage.evaluate(
            () => document.doctype !== null,
          );
          let htmlValidateFindings: RawFinding[] = [];
          let pageHtmlValidateRan = false;
          try {
            htmlValidateFindings = await htmlValidateFindingsForPage(
              currentPage,
              url,
            );
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
                  description: "The document does not declare a document type.",
                  help: "Each page must have a doctype so browsers parse it in standards mode.",
                  nodes: [
                    {
                      html: "<html>",
                      target: ["html"],
                    },
                  ],
                },
              ];

          const defaultTargetSize = await axeTargetSizeViolations(currentPage);
          violations = [...violations, ...defaultTargetSize];
          violations = await collectViewportAndPointerViolations(
            currentPage,
            violations,
          );

          const conditionsBefore = stageMs.conditions ?? 0;
          const {
            conditionViolations,
            conditionCustomFindings,
            conditionProbeFailures,
          } = await timed("conditions", () =>
            collectBrowserConditionFindings(
              currentPage,
              url,
              conditions,
              violations,
              customFindings,
            ),
          );
          // Snapshot/validate/viewport work around the conditions pass above.
          stageMs.other =
            (stageMs.other ?? 0) +
            (Date.now() - otherStart) -
            ((stageMs.conditions ?? 0) - conditionsBefore);

          pages.push({
            url,
            loadedCleanly: true,
            finalUrl: currentPage.url(),
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
        } catch (error) {
          // Contained per page (axe crash, navigation failure, blocked
          // request, …): sibling pages' findings are kept. A total outage
          // (zero pages) still fails via the `pageFailures` synthesis in
          // `scanRuntime` below — never a silent pass. Query stripped
          // (preview tokens).
          const message =
            error instanceof Error ? error.message : String(error);
          pageFailures.push({ url, error: message });
          console.warn(
            `[warning] runtime page failed, continuing with other pages: ${url.replace(/\?[^\s"'<>]*/g, "")}: ${message.slice(0, 300)}`,
          );
        } finally {
          // Close markers: teardown is the only untimed await in the page
          // loop — if a run stalls here, these lines name it. `page` is
          // still null when `newPage()` itself threw; never touch it then.
          console.info("[progress] runtime page close started");
          if (page) await closeTeardown("page", page.close());
          console.info("[progress] runtime page close finished");
        }
      }
    } finally {
      console.info("[progress] runtime context close started");
      await closeTeardown("context", context.close());
      console.info("[progress] runtime context close finished");
    }
    console.info(
      `[timing] runtime pages scanned=${pages.length} failed=${pageFailures.length} axe=${stageMs.axe ?? 0}ms custom=${stageMs.custom ?? 0}ms conditions=${stageMs.conditions ?? 0}ms other=${stageMs.other ?? 0}ms`,
    );
    return { pages, pageFailures };
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
 * Pathname of a rendered page URL, normalized for route↔file coverage matching
 * (`merge-findings.ts`). Absolute page URLs are reduced to their path; query
 * and hash are dropped (preview tokens), and the root collapses to `/`.
 */
function scannedRouteOf(url: string): string | null {
  try {
    const pathname = new URL(url).pathname.replace(/\/+$/, "");
    return pathname === "" ? "/" : pathname;
  } catch {
    return null;
  }
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
    const scanStart = Date.now();
    const { pages, pageFailures } = await scanner(urls);
    const pagesMs = Date.now() - scanStart;
    // Total outage with contained per-page failures: surface the first
    // failure as the scan error so authority gates degrade to
    // `unable_to_verify` (never a silent pass) exactly like a thrown scan.
    if (pages.length === 0 && pageFailures.length > 0) {
      const first = pageFailures[0] as RuntimePageFailure;
      return {
        findings: [],
        pagesScanned: 0,
        pageFailures,
        error: classifyRuntimeScanError(new Error(first.error)),
      };
    }
    const siteLevelChecksRan = pages.length >= 2;
    const htmlValidateRan = pages.some((page) => page.htmlValidateRan === true);
    const linkStart = Date.now();
    // The crawl resolves only when fully done, so log its start budget here.
    console.info(
      `[progress] runtime link check started urls=${urls.length} quota=${maxRuntimePages()}`,
    );
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
    const linkcheckMs = Date.now() - linkStart;
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
    console.info(
      `[timing] runtime scan pages=${pages.length} pagesMs=${pagesMs} linkcheckMs=${linkcheckMs} totalMs=${Date.now() - scanStart}`,
    );
    return {
      findings,
      pagesScanned: pages.length,
      scannedRoutes: pages
        .map((page) => scannedRouteOf(page.url))
        .filter((route): route is string => route !== null),
      siteLevelChecksRan,
      htmlValidateRan,
      linkCheckRan,
      applicabilityFacts,
      probeFailures,
      pageFailures,
    };
  } catch (error) {
    // This is the only place the unclassified cause is visible: callers only
    // receive the user-safe classification, and a failed runtime sub-scan does
    // not fail the job — so without this warn the root error never reaches
    // function logs or Sentry. Query strings are stripped (preview tokens).
    const raw = error instanceof Error ? error.message : String(error);
    // Stage the raw browser markers the classifier cannot map (launch vs
    // navigation vs axe injection), so the next generic failure names where
    // the scan died instead of collapsing to "Runtime scan failed.".
    const stage =
      /browserType\.launch|browserType\.newPage|addScriptTag|page\.evaluate|page\.goto/.test(
        raw,
      )
        ? raw.match(
            /browserType\.launch|browserType\.newPage|addScriptTag|page\.evaluate|page\.goto/,
          )?.[0]
        : "unknown";
    console.warn(
      `[warning] runtime scan failed (${error instanceof Error ? error.name : "unknown"}, stage ${stage}): ${raw.replace(/\?[^\s"'<>]*/g, "")}`,
    );
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
      // Only the color-scheme-sensitive rules are reported from this pass, so
      // restrict the engine to them instead of re-running the whole ruleset.
      const axeResult = await runAxeOnPage(page, {
        runOnly: [...THEME_SENSITIVE_AXE_RULES],
      });
      const themeAxe = axeResult.violations.filter((v) =>
        THEME_SENSITIVE_AXE_RULES.has(v.id),
      );
      const themeCustom = await runThemeSensitiveCustomChecks(page, url);
      const label = conditionLabel(condition);
      conditionViolations.push(
        ...conditionSpecificViolations(baseViolations, themeAxe, label),
      );
      conditionCustomFindings.push(
        ...conditionSpecificFindings(
          baseCustomFindings,
          themeCustom.findings,
          label,
        ),
      );
      conditionProbeFailures.push(...themeCustom.probeFailures);
    } finally {
      await page.emulateMedia(RESET_EMULATION);
    }
  }
  return {
    conditionViolations,
    conditionCustomFindings,
    conditionProbeFailures,
  };
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
    ({ pages } = await scanner([url]));
  } catch (error) {
    // Unreachable / blocked / scan failure: we cannot prove the fix, so the
    // violation is treated as still present (fail closed — never verified).
    // Log it: verify runs from a user click with no job record, so this warn
    // is the only trace when re-verification keeps failing.
    const raw = error instanceof Error ? error.message : String(error);
    console.warn(
      `[warning] runtime re-verify failed (fail closed): ${raw.replace(/\?[^\s"'<>]*/g, "")}`,
    );
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
