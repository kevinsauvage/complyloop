import { createRequire } from "node:module";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { PublicError, publicMessage } from "@/core/public-error";
import type { RawFinding } from "../types";
import {
  findingsFromAxePages,
  joinRuntimeUrl,
  runtimeRoutesFor,
  type AxeViolationLike,
  type RuntimeScanPageResult,
  type RuntimeScanResult,
} from "./findings";
import {
  allowRuntimeNavigation,
  assertSafeRuntimeUrl,
  createRedirectHopGuard,
  TOO_MANY_REDIRECTS_MESSAGE,
  UNSAFE_RUNTIME_URL_MESSAGE,
  type DnsLookup,
} from "./url-safety";
import { maxRuntimePages } from "@/server/resource-limits";

export type RuntimePageScanner = (
  urls: ReadonlyArray<string>,
) => Promise<RuntimeScanPageResult[]>;

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser) {
    sharedBrowser = await chromium.launch({ headless: true });
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

interface AxeRunResult {
  violations: Array<{
    id: string;
    impact?: string | null;
    description: string;
    help: string;
    nodes: Array<{
      html: string;
      target: Array<string | string[]>;
      failureSummary?: string;
    }>;
  }>;
}

/**
 * Inject axe from disk and analyze the current page (main frame).
 * Do not switch to `@axe-core/playwright`: it injects `axe-core`'s `source`
 * string by default, which Next/webpack rewrites (`module is not defined`).
 * Disk `axe.min.js` plus our SSRF `context.route` interceptor is the adapter.
 */
export async function runAxeOnPage(page: Page): Promise<{
  violations: AxeViolationLike[];
}> {
  await page.addScriptTag({ path: resolveAxeMinJsPath() });
  const results = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: { run: () => Promise<AxeRunResult> };
      }
    ).axe;
    return axe.run();
  });

  return {
    violations: results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        html: node.html,
        target: node.target.map(String),
        failureSummary: node.failureSummary,
      })),
    })),
  };
}

/**
 * Playwright + axe-core scanner with DNS/redirect SSRF checks on every request.
 */
function createPlaywrightAxeScanner(options?: {
  lookup?: DnsLookup;
}): RuntimePageScanner {
  const lookupOptions = options?.lookup ? { lookup: options.lookup } : undefined;

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
            // Re-resolve DNS immediately before goto to shrink rebinding TOCTOU.
            await assertSafeRuntimeUrl(url, lookupOptions);
            await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
          } catch (error) {
            if (blockedReason) throw new PublicError(blockedReason);
            throw error;
          }
          if (blockedReason) {
            throw new PublicError(blockedReason);
          }
          const results = await runAxeOnPage(page);
          pages.push({
            url,
            violations: results.violations,
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

/** Default Playwright + axe-core page scanner. */
const playwrightAxeScanner: RuntimePageScanner = createPlaywrightAxeScanner();

export interface ScanRuntimeOptions {
  runtimeBaseUrl?: string;
  runtimeRoutes?: string[];
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

  try {
    // Resolve + reject private addresses before opening a browser.
    await assertSafeRuntimeUrl(
      base,
      options.lookup ? { lookup: options.lookup } : undefined,
    );
  } catch (error) {
    return {
      findings: [],
      pagesScanned: 0,
      error: publicMessage(error, UNSAFE_RUNTIME_URL_MESSAGE),
    };
  }

  const urls = routes.map((route) => joinRuntimeUrl(base, route));
  if (urls.length > maxRuntimePages()) {
    return {
      findings: [],
      pagesScanned: 0,
      error: `Runtime audit exceeds the ${maxRuntimePages()} page quota. Reduce configured routes or raise ASSESSMENT_MAX_RUNTIME_PAGES.`,
    };
  }
  const scanner =
    options.scanner ??
    (options.lookup
      ? createPlaywrightAxeScanner({ lookup: options.lookup })
      : playwrightAxeScanner);
  try {
    // Re-validate each navigation URL (path may differ from base origin).
    for (const url of urls) {
      await assertSafeRuntimeUrl(
        url,
        options.lookup ? { lookup: options.lookup } : undefined,
      );
    }
    const pages = await scanner(urls);
    return {
      findings: findingsFromAxePages(pages),
      pagesScanned: pages.length,
    };
  } catch (error) {
    return {
      findings: [],
      pagesScanned: 0,
      error: publicMessage(error, "Runtime scan failed."),
    };
  }
}

/**
 * Re-checks whether a specific DOM finding still fails on its URL.
 * Returns true when the same check + selector (or snippet) is still present.
 */
export async function runtimeViolationStillPresent(
  finding: Pick<RawFinding, "checkId" | "location">,
  scanner: RuntimePageScanner = playwrightAxeScanner,
): Promise<boolean> {
  if (finding.location.kind !== "dom") return false;
  const url = finding.location.url;
  const selector = finding.location.selector;
  const snippet = finding.location.snippet;
  await assertSafeRuntimeUrl(url);
  const pages = await scanner([url]);
  const raw = findingsFromAxePages(pages);
  return raw.some(
    (candidate) =>
      candidate.checkId === finding.checkId &&
      candidate.location.kind === "dom" &&
      (candidate.location.selector === selector ||
        candidate.location.snippet === snippet),
  );
}
