import type { Confidence, Severity } from "../../contract/statuses.js";
import type { RawFinding } from "../../types.js";
import {
  assertSafeRuntimeUrl,
  type DnsLookup,
} from "../url-safety.js";

const SKIP_LINK_SCHEMES = /^(mailto:|tel:|javascript:|data:|#)/i;

function isSameOrigin(base: URL, target: string): boolean {
  try {
    const resolved = new URL(target, base.href);
    return resolved.origin === base.origin;
  } catch {
    return false;
  }
}

function snippetForLink(url: string, displayText?: string): string {
  const label = displayText?.trim();
  if (label) {
    const text =
      label.length > 80 ? `${label.slice(0, 77)}…` : label;
    return `<a href="${url}">${text}</a>`;
  }
  return `<a href="${url}">`;
}

function brokenLinkFinding(
  pageUrl: string,
  linkUrl: string,
  status: number | undefined,
  displayText: string | undefined,
  confidence: Confidence,
): RawFinding {
  const statusLabel =
    status !== undefined ? `HTTP ${status}` : "unreachable destination";
  const severity: Severity = status !== undefined && status >= 500 ? "critical" : "serious";
  return {
    checkId: "broken-link",
    kind: "violation",
    severity,
    confidence,
    reason: `Link destination failed (${statusLabel}): ${linkUrl}`,
    location: {
      kind: "dom",
      url: pageUrl,
      selector: `a[href="${linkUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`,
      snippet: snippetForLink(linkUrl, displayText),
      context: statusLabel,
    },
    fix: null,
    engine: "runtime",
  };
}

export interface BrokenLinkCheckOptions {
  lookup?: DnsLookup;
}

/**
 * Validates same-origin links on each preview route with linkinator.
 * External, unsafe, and non-http(s) targets are skipped (SSRF policy).
 */
export async function brokenLinkFindingsForUrls(
  urls: ReadonlyArray<string>,
  options?: BrokenLinkCheckOptions,
): Promise<RawFinding[]> {
  const lookupOptions = options?.lookup ? { lookup: options.lookup } : undefined;
  const findings: RawFinding[] = [];
  const seen = new Set<string>();
  const { check, LinkState } = await import("linkinator");

  for (const pageUrl of urls) {
    await assertSafeRuntimeUrl(pageUrl, lookupOptions);
    const pageOrigin = new URL(pageUrl);

    const result = await check({
      path: pageUrl,
      recurse: false,
      linksToSkip: async (linkUrl) => {
        if (SKIP_LINK_SCHEMES.test(linkUrl.trim())) return true;
        try {
          const resolved = new URL(linkUrl, pageOrigin.href);
          if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
            return true;
          }
          if (!isSameOrigin(pageOrigin, resolved.href)) return true;
          await assertSafeRuntimeUrl(resolved.href, lookupOptions);
          return false;
        } catch {
          return true;
        }
      },
    });

    for (const link of result.links) {
      if (link.state !== LinkState.BROKEN) continue;
      if (!link.parent || link.parent !== pageUrl) continue;
      if (!isSameOrigin(pageOrigin, link.url)) continue;

      const dedupeKey = `${pageUrl}::${link.url}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const confidence: Confidence =
        link.status !== undefined && link.status >= 400 && link.status < 500
          ? "high"
          : "medium";

      findings.push(
        brokenLinkFinding(
          pageUrl,
          link.url,
          link.status,
          link.displayText,
          confidence,
        ),
      );
    }
  }

  return findings;
}
