/**
 * Sitemap parsing for the preview-URL picker.
 *
 * Pure and network-free on purpose: the guarded fetch lives in the server
 * layer, so this half is testable from fixture documents alone and cannot
 * smuggle an outbound request into a unit test. Everything here is bounded —
 * a hostile sitemap must not be able to grow memory or the option list.
 *
 * Both scans below are linear. A regex like `/<loc\b[^>]*>([\s\S]*?)<\/loc>/g`
 * backtracks quadratically when a document is full of `<loc` openers and no
 * closers — a 1 MB body took ~30 s of synchronous CPU to reject — so the
 * element walk is done with `indexOf` instead.
 */

import { normalizeRoutes } from "./routes.ts";

/** Entries kept from one sitemap document, after de-duplication. */
export const SITEMAP_MAX_LOCS = 1_000;

/** Sitemap documents consulted for one discovery (index children included). */
export const SITEMAP_MAX_DOCUMENTS = 5;

/** Route options offered to the picker. */
export const SITEMAP_MAX_URLS = 200;

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

/**
 * Decodes the XML text of one element. Invalid numeric references keep their
 * literal form instead of throwing: `String.fromCodePoint` raises on
 * out-of-range or `NaN` code points, and a hostile `<loc>&#x110000;</loc>`
 * must not turn "unparseable sitemap" into a 500.
 */
function decodeXmlText(raw: string): string {
  const trimmed = raw.trim();
  // CDATA may be wrapped in whitespace (`<loc>\n  <![CDATA[…]]>\n</loc>`).
  const unwrapped =
    trimmed.startsWith("<![CDATA[") && trimmed.endsWith("]]>")
      ? trimmed.slice("<![CDATA[".length, -"]]>".length)
      : trimmed;

  return unwrapped
    .replace(
      /&#x([0-9a-f]+);/gi,
      (match, hex: string) => decodeCodePoint(hex, 16) ?? match,
    )
    .replace(
      /&#(\d+);/g,
      (match, digits: string) => decodeCodePoint(digits, 10) ?? match,
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => {
      return NAMED_ENTITIES[name.toLowerCase()] ?? match;
    })
    .trim();
}

function decodeCodePoint(digits: string, radix: 10 | 16): string | null {
  const value = Number.parseInt(digits, radix);
  if (!Number.isSafeInteger(value)) return null;
  // Out of the Unicode range, or a lone surrogate half: not a valid character.
  if (value < 0 || value > 0x10ffff) return null;
  if (value >= 0xd800 && value <= 0xdfff) return null;
  return String.fromCodePoint(value);
}

/** Removes `<!-- … -->` runs in one pass; an unterminated run swallows the rest. */
function stripComments(source: string): string {
  let out = "";
  let cursor = 0;
  for (;;) {
    const start = source.indexOf("<!--", cursor);
    if (start === -1) return out + source.slice(cursor);
    out += source.slice(cursor, start);
    const end = source.indexOf("-->", start + 4);
    if (end === -1) return out;
    cursor = end + 3;
  }
}

function isTagSpace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

/**
 * Collects `<loc …>value</loc>` elements in document order.
 *
 * `<image:loc>` and `<video:loc>` are not matched: `indexOf("<loc")` needs the
 * `<` and `l` adjacent, so the prefixed form never qualifies. A malformed open
 * tag without `>` ends the walk rather than scanning to the end of the buffer.
 */
function readLocElements(source: string): {
  locs: string[];
  truncated: boolean;
} {
  const locs: string[] = [];
  let cursor = 0;

  for (;;) {
    const open = source.indexOf("<loc", cursor);
    if (open === -1) return { locs, truncated: false };

    const afterName = source.charCodeAt(open + 4);
    if (!isTagSpace(afterName) && afterName !== 0x3e /* > */) {
      // `<location>` and friends: not the element we want.
      cursor = open + 4;
      continue;
    }

    const tagEnd = source.indexOf(">", open);
    if (tagEnd === -1) return { locs, truncated: false };

    const close = source.indexOf("</loc", tagEnd);
    if (close === -1) return { locs, truncated: false };
    const afterClose = source.charCodeAt(close + 5);
    if (!isTagSpace(afterClose) && afterClose !== 0x3e) {
      cursor = close + 5;
      continue;
    }

    if (locs.length >= SITEMAP_MAX_LOCS) return { locs, truncated: true };

    const loc = decodeXmlText(source.slice(tagEnd + 1, close));
    if (loc.length > 0) locs.push(loc);
    cursor = close + 5;
  }
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
  const source = stripComments(xml);
  const kind: SitemapDocumentKind = /<sitemapindex\b/i.test(source)
    ? "index"
    : /<urlset\b/i.test(source)
      ? "urlset"
      : "unknown";

  // Nothing to read in HTML or a truncated document: skip the element walk.
  if (kind === "unknown") return { kind, locs: [], truncated: false };

  return { kind, ...readLocElements(source) };
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
