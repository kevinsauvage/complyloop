import "server-only";

import { gunzipSync } from "node:zlib";

import {
  parseSitemapDocument,
  robotsSitemapUrls,
  SITEMAP_MAX_DOCUMENTS,
  sitemapPathsFromLocs,
} from "@complyloop/analysis-core/runtime/sitemap";
import {
  assertSafeRuntimeUrl,
  type DnsLookup,
} from "@complyloop/analysis-core/runtime/url-safety";

/** Ceiling on one sitemap/robots response, before decompression. */
const MAX_DOCUMENT_BYTES = 1_000_000;
/** Ceiling on the decompressed text (a gzip sitemap is a zip-bomb surface). */
const MAX_DECOMPRESSED_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECT_HOPS = 5;
/**
 * Wall-clock budget for the whole discovery. One request per document is
 * bounded by {@link REQUEST_TIMEOUT_MS}, but robots plus five documents plus
 * redirect hops would otherwise add up to minutes inside one handler.
 */
const TOTAL_BUDGET_MS = 20_000;

export interface DiscoveredRuntimeRoutes {
  /** Where the offered paths came from; `none` means "add pages by hand". */
  source: "robots" | "sitemap" | "none";
  paths: string[];
  /** True when the sitemap declared more pages than the picker offers. */
  truncated: boolean;
}

/**
 * Reads the preview site's sitemap and returns the page paths it declares, so
 * the settings picker can offer real URLs instead of asking the user to type
 * them.
 *
 * Every hop goes through {@link assertSafeRuntimeUrl} — this fetches a URL the
 * user just typed, so it is an SSRF surface exactly like the audit itself.
 * Redirects are followed by hand for that reason (`redirect: "manual"`), and
 * a site with no sitemap is a normal `source: "none"` result, not an error.
 * The caller owns authorization and rate limiting.
 */
export async function discoverRuntimeRoutes(
  baseUrl: string,
  options?: { lookup?: DnsLookup },
): Promise<DiscoveredRuntimeRoutes> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  // The base URL is the one value the user typed: refusing it is an error they
  // can act on. Everything below it is discovered content, so a refusal there
  // degrades to "no sitemap" instead of blaming the preview URL.
  const safeBase = await assertSafeRuntimeUrl(baseUrl, options);
  const origin = new URL(safeBase).origin;

  const robots = await fetchDocument(`${origin}/robots.txt`, options, deadline);
  const declared = robots === null ? [] : robotsSitemapUrls(robots, origin);
  const candidates = declared.length > 0 ? declared : [`${origin}/sitemap.xml`];
  const fromRobots = declared.length > 0;

  const locs: string[] = [];
  const visited = new Set<string>();
  let truncated = false;
  let foundDocument = false;

  // Breadth-first over the index: children are appended while the cap holds.
  const queue = [...candidates];
  while (queue.length > 0 && visited.size < SITEMAP_MAX_DOCUMENTS) {
    if (Date.now() >= deadline) {
      truncated = true;
      break;
    }
    const next = queue.shift();
    if (next === undefined) break;
    if (visited.has(next)) continue;
    visited.add(next);

    const xml = await fetchDocument(next, options, deadline);
    if (xml === null) continue;
    const parsed = parseSitemapDocument(xml);
    if (parsed.kind === "unknown") continue;
    foundDocument = true;
    truncated = truncated || parsed.truncated;

    if (parsed.kind === "index") {
      for (const child of parsed.locs) {
        if (queue.length + visited.size >= SITEMAP_MAX_DOCUMENTS) {
          // More child sitemaps than the budget allows: say so rather than
          // presenting a subset as the site's full page list.
          truncated = true;
          break;
        }
        queue.push(child);
      }
      continue;
    }
    locs.push(...parsed.locs);
  }

  if (!foundDocument) return { source: "none", paths: [], truncated: false };

  const result = sitemapPathsFromLocs(locs, origin);
  return {
    source: fromRobots ? "robots" : "sitemap",
    paths: result.paths,
    truncated: truncated || result.truncated,
  };
}

/**
 * Guarded GET returning the decoded body, or null when the document is
 * missing, unreachable, not a document, or over the size ceiling. A refused
 * URL (private host, bad port, unresolvable) throws — the caller turns that
 * into a form error, since it means the URL itself is wrong.
 */
async function fetchDocument(
  rawUrl: string,
  options: { lookup?: DnsLookup } | undefined,
  deadline: number,
): Promise<string | null> {
  let url: string;
  try {
    url = await assertSafeRuntimeUrl(rawUrl, options);
  } catch {
    // Content-derived URL (a robots/txt directive, an index child, a redirect
    // target): the guard refusing it means "skip this document", not "the
    // preview URL is wrong".
    return null;
  }

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;
    const response = await fetchGuarded(url, remaining);
    if (response === null) return null;

    if (isRedirect(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) return null;
      let target: string;
      try {
        target = new URL(location, url).href;
      } catch {
        return null;
      }
      // Each hop is re-checked: a redirect is how an SSRF filter gets bypassed.
      try {
        url = await assertSafeRuntimeUrl(target, options);
      } catch {
        return null;
      }
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const bytes = await readBounded(response);
    return bytes === null ? null : decodeDocument(bytes);
  }

  return null;
}

async function fetchGuarded(
  url: string,
  remainingMs: number,
): Promise<Response | null> {
  try {
    return await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remainingMs)),
      headers: {
        accept: "application/xml,text/xml,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": "ComplyLoop-Sitemap/1.0 (+https://complyloop.app)",
      },
    });
  } catch {
    return null;
  }
}

function isRedirect(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

/**
 * Reads at most {@link MAX_DOCUMENT_BYTES} from the body, aborting as soon as
 * the ceiling is crossed — checking `content-length` alone would trust the
 * server we are guarding against.
 */
async function readBounded(response: Response): Promise<Uint8Array | null> {
  const body = response.body;
  if (body === null) return null;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value === undefined) continue;
      total += value.byteLength;
      if (total > MAX_DOCUMENT_BYTES) {
        // Stop the transfer now; the deadline alone would leave it draining.
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Sitemaps are frequently served gzipped as `.xml.gz` without a filename hint. */
function decodeDocument(bytes: Uint8Array): string | null {
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (!isGzip) return new TextDecoder().decode(bytes);
  try {
    const inflated = gunzipSync(bytes, {
      maxOutputLength: MAX_DECOMPRESSED_BYTES,
    });
    return new TextDecoder().decode(inflated);
  } catch {
    return null;
  }
}
