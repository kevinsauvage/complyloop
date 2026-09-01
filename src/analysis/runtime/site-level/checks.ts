import type { RawFinding } from "../../types";
import type { RuntimePageSnapshot } from "./types";

function siteFinding(
  checkId: RawFinding["checkId"],
  pages: string[],
  detail: string,
  reason: string,
): RawFinding {
  return {
    checkId,
    kind: "violation",
    severity: "serious",
    confidence: "medium",
    reason,
    location: { kind: "site", pages, detail },
    fix: null,
    engine: "runtime",
  };
}

function mechanismCount(snapshots: ReadonlyArray<RuntimePageSnapshot>): number {
  let hasNav = false;
  let hasSearch = false;
  let hasSitemap = false;

  for (const snapshot of snapshots) {
    if (snapshot.navLinks.length > 0) hasNav = true;
    if (snapshot.searchInputs.length > 0) hasSearch = true;
    if (snapshot.sitemapLinks.length > 0) hasSitemap = true;
  }

  return [hasNav, hasSearch, hasSitemap].filter(Boolean).length;
}

function navSignatures(snapshots: ReadonlyArray<RuntimePageSnapshot>): string[] {
  return snapshots
    .map((snapshot) => snapshot.navLinks.join(">"))
    .filter((signature) => signature.length > 0);
}

function inconsistentLabels(snapshots: ReadonlyArray<RuntimePageSnapshot>): string[] {
  const labelsByKey = new Map<string, Set<string>>();

  for (const snapshot of snapshots) {
    for (const field of snapshot.formFields) {
      const key = field.autoComplete
        ? `ac:${field.autoComplete}`
        : `name:${field.name}`;
      const labels = labelsByKey.get(key) ?? new Set<string>();
      if (field.label) labels.add(field.label);
      labelsByKey.set(key, labels);
    }
  }

  const mismatches: string[] = [];
  for (const [key, labels] of labelsByKey) {
    if (labels.size > 1) {
      mismatches.push(`${key} (${[...labels].join(" vs ")})`);
    }
  }
  return mismatches;
}

function helpSignatures(snapshots: ReadonlyArray<RuntimePageSnapshot>): string[] {
  return snapshots
    .map((snapshot) => snapshot.helpLinks.join(">"))
    .filter((signature) => signature.length > 0);
}

export function runSiteLevelChecks(
  snapshots: ReadonlyArray<RuntimePageSnapshot>,
): RawFinding[] {
  if (snapshots.length < 2) return [];

  const pages = snapshots.map((snapshot) => snapshot.url);
  const findings: RawFinding[] = [];

  if (mechanismCount(snapshots) < 2) {
    findings.push(
      siteFinding(
        "multiple-ways",
        pages,
        "Fewer than two navigation mechanisms detected",
        "The audited pages expose fewer than two ways to find other pages (navigation, search, or sitemap).",
      ),
    );
  }

  const signatures = navSignatures(snapshots);
  const uniqueSignatures = new Set(signatures);
  if (signatures.length > 1 && uniqueSignatures.size > 1) {
    findings.push(
      siteFinding(
        "consistent-nav",
        pages,
        "Primary navigation differs between pages",
        "Navigation link order or labels differ across the configured preview routes.",
      ),
    );
  }

  const labelMismatches = inconsistentLabels(snapshots);
  if (labelMismatches.length > 0) {
    findings.push(
      siteFinding(
        "consistent-labels",
        pages,
        labelMismatches.slice(0, 3).join("; "),
        `Fields with the same purpose use different labels across pages: ${labelMismatches.slice(0, 3).join("; ")}.`,
      ),
    );
  }

  const helpOrderSignatures = helpSignatures(snapshots);
  const uniqueHelpOrders = new Set(helpOrderSignatures);
  if (helpOrderSignatures.length > 1 && uniqueHelpOrders.size > 1) {
    findings.push(
      siteFinding(
        "consistent-help",
        pages,
        "Help mechanisms differ between pages",
        "Help, support, or contact links appear in a different order across the configured preview routes.",
      ),
    );
  }

  return findings;
}
