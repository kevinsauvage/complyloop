import type { DomLocation, FindingLocation, SiteLocation, SourceLocation } from "@complyloop/analysis-core/contract/finding-types";

export function isSourceLocation(
  location: FindingLocation,
): location is SourceLocation {
  return location.kind === "source";
}

export function isDomLocation(
  location: FindingLocation,
): location is DomLocation {
  return location.kind === "dom";
}

export function isSiteLocation(
  location: FindingLocation,
): location is SiteLocation {
  return location.kind === "site";
}

/** Code or DOM snippet when present; site findings use their detail text. */
export function locationSnippet(location: FindingLocation): string {
  if (location.kind === "site") return location.detail;
  return location.snippet;
}

/** Source path, page URL, or comma-separated site pages. */
export function locationPathOrUrl(location: FindingLocation): string {
  if (location.kind === "source") return location.filePath;
  if (location.kind === "dom") return location.url;
  return location.pages.join(", ");
}

/** Short human/UI reference: `file:line`, `url › selector`, or multi-page site ref. */
export function formatLocationRef(location: FindingLocation): string {
  if (location.kind === "source") {
    return `${location.filePath}:${location.line}`;
  }
  if (location.kind === "site") {
    const pages =
      location.pages.length <= 2
        ? location.pages.join(", ")
        : `${location.pages.length} pages`;
    return `Site: ${pages} — ${location.detail}`;
  }
  if (location.elementLabel) {
    try {
      const path = new URL(location.url).pathname;
      return `${path} › ${location.elementLabel}`;
    } catch {
      return `${location.url} › ${location.elementLabel}`;
    }
  }
  return `${location.url} › ${location.selector}`;
}

/** DOM finding details for the finding page. */
export function domLocationDetails(
  location: DomLocation,
): Array<{ term: string; value: string }> {
  const details: Array<{ term: string; value: string }> = [];
  if (location.elementLabel) {
    details.push({ term: "Element", value: location.elementLabel });
  }
  details.push({ term: "Page", value: location.url });
  if (location.selector && location.selector !== "(unknown)") {
    details.push({ term: "Selector", value: location.selector });
  }
  if (location.context) {
    details.push({ term: "Context", value: location.context });
  }
  return details;
}
