import type { Confidence, Severity } from "../../contract/statuses.ts";
import { maxRuntimePages } from "../../contract/assessment-limits.ts";
import type { RawFinding } from "../../types.ts";
import {
  assertSafeRuntimeUrl,
  type DnsLookup,
} from "../url-safety.ts";
import type { RuntimePageSnapshot } from "./types.ts";

const SKIP_LINK_SCHEMES = /^(mailto:|tel:|javascript:|data:)/i;

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
  reasonSuffix?: string,
): RawFinding {
  const statusLabel =
    status !== undefined ? `HTTP ${status}` : "unreachable destination";
  const severity: Severity = status !== undefined && status >= 500 ? "critical" : "serious";
  return {
    checkId: "broken-link",
    kind: "violation",
    severity,
    confidence,
    reason: `Link destination failed (${statusLabel}${reasonSuffix ? `; ${reasonSuffix}` : ""}): ${linkUrl}`,
    location: {
      kind: "dom",
      url: pageUrl,
      selector: `a[href="${linkUrl.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`,
      snippet: snippetForLink(linkUrl, displayText),
      context: statusLabel,
    },
    fix: null,
    analyzerId: "linkinator",
  };
}

export interface BrokenLinkCheckOptions {
  lookup?: DnsLookup;
  /** When true, follow same-origin links up to `maxUrls`. */
  recurse?: boolean;
  maxUrls?: number;
  snapshots?: ReadonlyArray<RuntimePageSnapshot>;
}

function fragmentFindingsFromSnapshots(
  snapshots: ReadonlyArray<RuntimePageSnapshot>,
): RawFinding[] {
  const findings: RawFinding[] = [];
  const seen = new Set<string>();

  for (const snapshot of snapshots) {
    const idSet = new Set(snapshot.elementIds);
    for (const link of snapshot.fragmentLinks) {
      const hashIndex = link.href.indexOf("#");
      if (hashIndex === -1) continue;
      let fragmentId: string;
      try {
        fragmentId = decodeURIComponent(link.href.slice(hashIndex + 1));
      } catch {
        // Malformed percent-escape (e.g. href="#%zz"): skip the link, never the audit.
        continue;
      }
      if (!fragmentId) continue;

      try {
        const resolved = new URL(link.href, snapshot.url);
        if (resolved.origin + resolved.pathname !== new URL(snapshot.url).origin + new URL(snapshot.url).pathname) {
          continue;
        }
      } catch {
        continue;
      }

      if (idSet.has(fragmentId)) continue;

      const dedupeKey = `${snapshot.url}::${link.href}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      findings.push(
        brokenLinkFinding(
          snapshot.url,
          link.href,
          undefined,
          link.label,
          "high",
          "fragment target missing on page",
        ),
      );
    }
  }

  return findings;
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
  const maxUrls = options?.maxUrls ?? maxRuntimePages();
  let crawledPages = 0;
  const { check, LinkState } = await import("linkinator");

  if (options?.snapshots && options.snapshots.length > 0) {
    findings.push(...fragmentFindingsFromSnapshots(options.snapshots));
  }

  for (const pageUrl of urls) {
    if (crawledPages >= maxUrls) break;
    crawledPages += 1;

    await assertSafeRuntimeUrl(pageUrl, lookupOptions);
    const pageOrigin = new URL(pageUrl);

    const result = await check({
      path: pageUrl,
      recurse: options?.recurse ?? false,
      linksToSkip: async (linkUrl) => {
        if (SKIP_LINK_SCHEMES.test(linkUrl.trim())) return true;
        if (linkUrl.trim().startsWith("#")) return true;
        try {
          const resolved = new URL(linkUrl, pageOrigin.href);
          if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
            return true;
          }
          if (!isSameOrigin(pageOrigin, resolved.href)) return true;
          if (options?.recurse && crawledPages >= maxUrls) return true;
          await assertSafeRuntimeUrl(resolved.href, lookupOptions);
          return false;
        } catch {
          return true;
        }
      },
    });

    for (const link of result.links) {
      if (link.state !== LinkState.BROKEN) continue;
      if (!link.parent) continue;
      if (!isSameOrigin(pageOrigin, link.url)) continue;

      const dedupeKey = `${link.parent}::${link.url}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const confidence: Confidence =
        link.status !== undefined && link.status >= 400 && link.status < 500
          ? "high"
          : "medium";

      findings.push(
        brokenLinkFinding(
          link.parent,
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
