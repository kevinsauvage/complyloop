/**
 * Sitemap parsing for the preview-URL picker.
 *
 * Pure and network-free on purpose: the guarded fetch lives in the server
 * layer, so this half is testable from fixture documents alone and cannot
 * smuggle an outbound request into a unit test. Everything here is bounded —
 * a hostile sitemap must not be able to grow memory or the option list.
 */

import { normalizeRoutes } from "./routes.ts";

/** Entries kept from one sitemap document, after de-duplication. */
export const SITEMAP_MAX_LOCS = 1_000;

/** Sitemap documents consulted for one discovery (index children included). */
export const SITEMAP_MAX_DOCUMENTS = 5;

/** Route options offered to the picker. */
export const SITEMAP_MAX_URLS = 200;

const LOC_PATTERN = /<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi;
const CDATA_PATTERN = /^<!\[CDATA\[([\s\S]*?)\]\]>$/;
const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export type SitemapDocumentKind = "urlset" | "index" | "unknown";

export interface ParsedSitemapDocument {
  kind: SitemapDocumentKind;
  locs: string[];
  /** True when the document declared more entries than {@link SITEMAP_MAX_LOCS}. */
  truncated: boolean;
}

function decodeXmlText(raw: string): string {
  const unwrapped = CDATA_PATTERN.exec(raw)?.[1] ?? raw;
  return unwrapped
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_match, digits: string) =>
      String.fromCodePoint(Number.parseInt(digits, 10)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      return NAMED_ENTITIES[name.toLowerCase()] ?? match;
    })
    .trim();
}

/**
 * Reads a sitemap or sitemap-index document. Comments are stripped first so a
 * commented-out `<loc>` is not offered as a page; CDATA wrappers are unwrapped
 * because real generators emit them around URLs containing `&`.
 *
 * Malformed XML yields `kind: "unknown"` and no locations rather than an
 * error: a broken sitemap means "nothing to offer", which the picker already
 * handles by letting the user add pages by hand.
 */
export function parseSitemapDocument(xml: string): ParsedSitemapDocument {
  const source = xml.replace(COMMENT_PATTERN, "");
  const kind: SitemapDocumentKind = /<sitemapindex\b/i.test(source)
    ? "index"
    : /<urlset\b/i.test(source)
      ? "urlset"
      : "unknown";

  const locs: string[] = [];
  let truncated = false;
  LOC_PATTERN.lastIndex = 0;
  for (const match of source.matchAll(LOC_PATTERN)) {
    const value = match[1];
    if (value === undefined) continue;
    const loc = decodeXmlText(value);
    if (loc.length === 0) continue;
    if (locs.length >= SITEMAP_MAX_LOCS) {
      truncated = true;
      break;
    }
    locs.push(loc);
  }

  return { kind, locs, truncated };
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
