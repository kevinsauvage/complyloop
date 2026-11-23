/**
 * Sitemap parsing for the preview-URL picker.
 *
 * Pure and network-free on purpose: the guarded fetch lives in the server
 * layer, so this half is testable from fixture documents alone and cannot
 * smuggle an outbound request into a unit test. Everything here is bounded —
 * a hostile sitemap must not be able to grow memory or the option list.
 *
 * Element reading is delegated to `fast-xml-parser`, which scans the document
 * linearly: a hand-rolled regex over `<loc>` backtracks quadratically on a
 * document full of openers and no closers (a 1 MB body took ~30 s of
 * synchronous CPU to reject). Malformed XML throws, which reads as "nothing to
 * offer" — the picker already lets the user add pages by hand.
 */

import { XMLParser } from "fast-xml-parser";

import { normalizeRoutes } from "./routes.ts";

/** Entries kept from one sitemap document, after de-duplication. */
export const SITEMAP_MAX_LOCS = 1_000;

/** Sitemap documents consulted for one discovery (index children included). */
export const SITEMAP_MAX_DOCUMENTS = 5;

/** Route options offered to the picker. */
export const SITEMAP_MAX_URLS = 200;

/** `urlset > url > loc` is the deepest legal nesting; extensions sit lower. */
const MAX_LOC_DEPTH = 4;

const parser = new XMLParser({
  ignoreAttributes: true,
  ignoreDeclaration: true,
  // A `<loc>` holding digits is a path, not a number.
  parseTagValue: false,
});

export type SitemapDocumentKind = "urlset" | "index" | "unknown";

export interface ParsedSitemapDocument {
  kind: SitemapDocumentKind;
  locs: string[];
  /** True when the document declared more entries than {@link SITEMAP_MAX_LOCS}. */
  truncated: boolean;
}

/**
 * Root element name, with an optional namespace prefix (`<sm:urlset>` is
 * legal). A sitemap index wins over a urlset: an index whose child list is
 * read as pages would offer `.xml` files as routes.
 */
function rootKind(tree: object): SitemapDocumentKind {
  const roots = Object.keys(tree);
  if (roots.some((key) => /(^|:)sitemapindex$/i.test(key))) return "index";
  if (roots.some((key) => /(^|:)urlset$/i.test(key))) return "urlset";
  return "unknown";
}

/**
 * Collects `<loc>` values in document order, wherever they are nested.
 *
 * Keyed on the element name alone rather than on `urlset > url`, so a stray
 * or differently-nested `<loc>` is still offered: the old hand parser was that
 * permissive and real generators do wrap their root. `image:loc` and
 * `video:loc` never match because their key carries the namespace prefix.
 */
function collectLocs(
  node: unknown,
  depth: number,
  locs: string[],
  state: { truncated: boolean },
): void {
  if (state.truncated || depth > MAX_LOC_DEPTH) return;
  if (Array.isArray(node)) {
    for (const item of node) collectLocs(item, depth, locs, state);
    return;
  }
  if (typeof node !== "object" || node === null) return;

  for (const [key, value] of Object.entries(node)) {
    if (key === "loc") {
      if (typeof value !== "string") continue;
      const loc = value.trim();
      if (loc.length === 0) continue;
      if (locs.length >= SITEMAP_MAX_LOCS) {
        // More entries declared than the cap: say so instead of silently
        // presenting a subset as the site's full page list.
        state.truncated = true;
        return;
      }
      locs.push(loc);
      continue;
    }
    collectLocs(value, depth + 1, locs, state);
  }
}

/**
 * Reads a sitemap or sitemap-index document. Comments are ignored by the
 * parser, so a commented-out `<loc>` is not offered as a page, and CDATA
 * wrappers are unwrapped because real generators emit them around URLs
 * containing `&`.
 *
 * Malformed XML yields `kind: "unknown"` and no locations rather than an
 * error: a broken sitemap means "nothing to offer".
 */
export function parseSitemapDocument(xml: string): ParsedSitemapDocument {
  let tree: unknown;
  try {
    tree = parser.parse(xml);
  } catch {
    return { kind: "unknown", locs: [], truncated: false };
  }
  if (typeof tree !== "object" || tree === null) {
    return { kind: "unknown", locs: [], truncated: false };
  }

  const locs: string[] = [];
  const state = { truncated: false };
  collectLocs(tree, 0, locs, state);
  return { kind: rootKind(tree), locs, truncated: state.truncated };
}

/**
 * `Sitemap:` directives from a robots.txt. Values may be absolute or relative
 * to the site root (both occur in the wild); anything unparseable is dropped
 * rather than guessed at.
 */
export function robotsSitemapUrls(
  robotsTxt: string,
  baseUrl: string,
): string[] {
  const base = parseHttpUrl(baseUrl);
  if (!base) return [];

  const urls: string[] = [];
  const seen = new Set<string>();
  for (const line of robotsTxt.split(/\r?\n/)) {
    const match = /^\s*sitemap\s*:\s*(\S+)\s*$/i.exec(line);
    const raw = match?.[1];
    if (raw === undefined) continue;
    const resolved = parseHttpUrl(raw, base);
    if (!resolved) continue;
    if (seen.has(resolved.href)) continue;
    seen.add(resolved.href);
    urls.push(resolved.href);
    if (urls.length >= SITEMAP_MAX_DOCUMENTS) break;
  }
  return urls;
}

function parseHttpUrl(raw: string, base?: URL): URL | null {
  let parsed: URL;
  try {
    parsed = base ? new URL(raw.trim(), base) : new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  return parsed;
}

/**
 * Same-origin page paths from sitemap locations, in document order.
 *
 * Cross-origin locations are dropped: the audit only ever visits the
 * configured preview origin, so offering another host's page would produce a
 * route the scan cannot use. The path is kept and the query/hash dropped — an
 * audit identifies a page by path.
 */
export function sitemapPathsFromLocs(
  locs: readonly string[],
  baseUrl: string,
  options?: { limit?: number },
): { paths: string[]; truncated: boolean } {
  const base = parseHttpUrl(baseUrl);
  if (!base) return { paths: [], truncated: false };
  const limit = options?.limit ?? SITEMAP_MAX_URLS;

  const paths: string[] = [];
  const seen = new Set<string>();
  for (const loc of locs) {
    const resolved = parseHttpUrl(loc, base);
    if (!resolved || resolved.origin !== base.origin) continue;
    const [path] = normalizeRoutes([resolved.pathname]);
    if (path === undefined || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }

  return { paths: paths.slice(0, limit), truncated: paths.length > limit };
}
