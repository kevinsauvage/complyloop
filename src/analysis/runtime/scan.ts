import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser } from "playwright";
import type { RawFinding } from "../types";
import {
  findingsFromAxePages,
  joinRuntimeUrl,
  runtimeRoutesFor,
  type RuntimeScanPageResult,
  type RuntimeScanResult,
} from "./findings";

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

/** Default Playwright + axe-core page scanner. */
export const playwrightAxeScanner: RuntimePageScanner = async (urls) => {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const pages: RuntimeScanPageResult[] = [];
  try {
    for (const url of urls) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        const results = await new AxeBuilder({ page }).analyze();
        pages.push({
          url,
          violations: results.violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            description: violation.description,
            help: violation.help,
            nodes: violation.nodes.map((node) => ({
              html: node.html,
              target: node.target.map(String),
            })),
          })),
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

export interface ScanRuntimeOptions {
  runtimeBaseUrl?: string;
  runtimeRoutes?: string[];
  /** Injected in tests; defaults to Playwright + axe. */
  scanner?: RuntimePageScanner;
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

  const urls = routes.map((route) => joinRuntimeUrl(base, route));
  const scanner = options.scanner ?? playwrightAxeScanner;
  try {
    const pages = await scanner(urls);
    return {
      findings: findingsFromAxePages(pages),
      pagesScanned: pages.length,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Runtime scan failed.";
    return { findings: [], pagesScanned: 0, error: message };
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
