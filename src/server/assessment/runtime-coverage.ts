/**
 * Runtime-authority coverage: which checked-in page files the runtime audit
 * actually rendered.
 *
 * `merge-findings.ts` suppresses composition-sensitive / runtime-only /
 * package-twin AST findings when the runtime audit ran — but the audit only
 * renders `project.runtimeRoutes` (default `["/"]`). Applying that drop
 * repo-wide hides AST findings on pages the browser never visited, which
 * derives `passed` for a requirement whose defect is still live. This module
 * maps the audited route pathnames back to the Next.js files that define those
 * pages, and reports whether the audit covered every discovered page (the case
 * where the repo-wide drop is safe).
 *
 * Conservative by design: anything we cannot map counts as uncovered, and a
 * checkout with no discoverable page files returns `null` (unknown coverage)
 * so callers keep AST findings rather than assume coverage.
 */
import path from "node:path";

import type { RuntimeFileCoverage } from "@complyloop/analysis-core/merge-findings";
import { listSourceFiles } from "@complyloop/analysis-core/source-files";

const APP_ROOTS = ["src/app", "app"];
const PAGES_ROOTS = ["src/pages", "pages"];
const PAGE_EXTENSIONS = new Set(["tsx", "jsx", "ts", "js"]);

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

/** Drops route-group `(x)`, parallel-slot `@x`, and private `_x` segments. */
function routeFromSegments(segments: readonly string[]): string {
  const kept = segments.filter(
    (segment) =>
      !segment.startsWith("(") &&
      !segment.startsWith("@") &&
      !segment.startsWith("_"),
  );
  return kept.length === 0 ? "/" : `/${kept.join("/")}`;
}

/** Route served by a Next.js App Router `page.<ext>` file, else `null`. */
export function appPageRoute(relativePath: string): string | null {
  const posix = toPosix(relativePath);
  for (const root of APP_ROOTS) {
    const prefix = `${root}/`;
    if (!posix.startsWith(prefix)) continue;
    const segments = posix.slice(prefix.length).split("/");
    const file = segments.pop() ?? "";
    const dot = file.lastIndexOf(".");
    if (dot < 0 || file.slice(0, dot) !== "page") return null;
    if (!PAGE_EXTENSIONS.has(file.slice(dot + 1))) return null;
    return routeFromSegments(segments);
  }
  return null;
}

/** Route served by a Next.js Pages Router file, else `null`. */
export function pagesPageRoute(relativePath: string): string | null {
  const posix = toPosix(relativePath);
  for (const root of PAGES_ROOTS) {
    const prefix = `${root}/`;
    if (!posix.startsWith(prefix)) continue;
    const segments = posix.slice(prefix.length).split("/");
    const file = segments.pop() ?? "";
    const dot = file.lastIndexOf(".");
    if (dot < 0 || !PAGE_EXTENSIONS.has(file.slice(dot + 1))) return null;
    const name = file.slice(0, dot);
    if (name.startsWith("_") || segments[0] === "api") return null;
    const routeSegments = name === "index" ? segments : [...segments, name];
    return routeFromSegments(routeSegments);
  }
  return null;
}

function pageRouteOf(relativePath: string): string | null {
  return appPageRoute(relativePath) ?? pagesPageRoute(relativePath);
}

/** `/x/` → `/x`; absolute URLs reduced to their path; query/hash dropped. */
function normalizeScannedRoute(route: string): string {
  let value = route;
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      // Keep the raw value; matching then misses, which is fail-closed.
    }
  }
  value = (value.split(/[?#]/)[0] ?? value).replace(/\/+$/, "");
  return value === "" ? "/" : value;
}

function segmentsOf(route: string): string[] {
  return route.split("/").filter((segment) => segment.length > 0);
}

/** True when a scanned route renders the page file's route (dynamic-aware). */
export function routeMatches(pageRoute: string, scannedRoute: string): boolean {
  const page = segmentsOf(pageRoute);
  const scanned = segmentsOf(scannedRoute);
  for (let index = 0; index < page.length; index += 1) {
    const segment = page[index]!;
    if (/^\[\[?\.\.\..+\]\]?$/.test(segment)) return true; // catch-all
    if (index >= scanned.length) return false;
    if (/^\[.+\]$/.test(segment)) continue; // dynamic single segment
    if (segment !== scanned[index]) return false;
  }
  return page.length === scanned.length;
}

/**
 * Maps the audited route pathnames to the page files they render.
 * Returns `null` when no page files are discoverable (unknown coverage).
 */
export function buildRuntimeCoverage(
  rootPath: string,
  scannedRoutes: readonly string[],
): RuntimeFileCoverage | null {
  const pageFiles = listSourceFiles(rootPath, "script")
    .map((absolute) => toPosix(path.relative(rootPath, absolute)))
    .filter((relative) => pageRouteOf(relative) !== null);
  if (pageFiles.length === 0) return null;

  const routes = scannedRoutes.map(normalizeScannedRoute);
  const coveredFiles = new Set<string>();
  let fullyCovered = true;
  for (const file of pageFiles) {
    const route = pageRouteOf(file);
    if (route && routes.some((candidate) => routeMatches(route, candidate))) {
      coveredFiles.add(file);
    } else {
      fullyCovered = false;
    }
  }
  return { fullyCovered, coveredFiles };
}
