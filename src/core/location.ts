import type { DomLocation, FindingLocation, SourceLocation } from "./finding-types";

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

/** Short human/UI reference: `file:line` or `url › selector`. */
export function formatLocationRef(location: FindingLocation): string {
  if (location.kind === "source") {
    return `${location.filePath}:${location.line}`;
  }
  return `${location.url} › ${location.selector}`;
}
