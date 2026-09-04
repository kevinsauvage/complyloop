import type { RawFinding } from "../../types.js";
import type { RuntimePageSnapshot } from "./types.js";

function siteFinding(
  checkId: RawFinding["checkId"],
  pages: string[],
  detail: string,
  reason: string,
  kind: RawFinding["kind"] = "violation",
): RawFinding {
  return {
    checkId,
    kind,
    severity: kind === "warning" ? "moderate" : "serious",
    confidence: "medium",
    reason,
    location: { kind: "site", pages, detail },
    fix: null,
    engine: "runtime",
    analyzerId: "site-level",
  };
}

/** Trailing auth/account chrome (Logout, Admin, …) may differ per session. */
const TRAILING_AUTH_NAV_LABEL =
  /^(log\s?out|sign\s?out|admin(?:istration)?|account|profile|my account|settings)$/i;

function normalizeNavLinks(links: readonly string[]): string[] {
  const copy = [...links];
  while (copy.length > 0) {
    const label = (copy[copy.length - 1]?.split("::")[0] ?? "").trim();
    if (TRAILING_AUTH_NAV_LABEL.test(label)) {
      copy.pop();
      continue;
    }
    break;
  }
  return copy;
}

function normalizedNavSignature(links: readonly string[]): string {
  return normalizeNavLinks(links).join(">");
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

function normalizedNavSignatures(
  snapshots: ReadonlyArray<RuntimePageSnapshot>,
): string[] {
  return snapshots
    .map((snapshot) => normalizedNavSignature(snapshot.navLinks))
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

function sitemapSignatures(
  snapshots: ReadonlyArray<RuntimePageSnapshot>,
): string[] {
  return snapshots
    .filter((snapshot) => snapshot.sitemapHref)
    .map(
      (snapshot) =>
        `${snapshot.sitemapPosition ?? "unknown"}::${snapshot.sitemapHref}`,
    );
}

function searchSignatures(
  snapshots: ReadonlyArray<RuntimePageSnapshot>,
): string[] {
  return snapshots
    .map((snapshot) => snapshot.searchSelector)
    .filter((signature): signature is string => signature !== undefined);
}

function checkCrossRouteLandmark(
  snapshots: ReadonlyArray<RuntimePageSnapshot>,
  role: string,
): boolean {
  const present = snapshots.map((snapshot) => snapshot.landmarkRoles.includes(role));
  return present.some(Boolean) && present.some((value) => !value);
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

  const navPresent = snapshots.map((snapshot) => snapshot.navLinks.length > 0);
  const someMissingNav =
    navPresent.some(Boolean) && navPresent.some((present) => !present);
  if (someMissingNav) {
    findings.push(
      siteFinding(
        "consistent-nav",
        pages,
        "Primary navigation missing on some routes",
        "Some preview routes expose a primary navigation landmark while others do not.",
      ),
    );
  } else {
    const signatures = normalizedNavSignatures(snapshots);
    const uniqueSignatures = new Set(signatures);
    if (signatures.length > 1 && uniqueSignatures.size > 1) {
      findings.push(
        siteFinding(
          "consistent-nav",
          pages,
          "Primary navigation differs between pages",
          "Navigation link order or labels differ across the configured preview routes — review whether the difference is intentional (e.g. localized or role-specific chrome).",
          "warning",
        ),
      );
    }
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

  const sitemapPages = snapshots.filter((snapshot) => snapshot.sitemapHref);
  if (sitemapPages.length > 0) {
    if (sitemapPages.length < snapshots.length) {
      findings.push(
        siteFinding(
          "consistent-sitemap",
          pages,
          "Sitemap entry point missing on some routes",
          "A sitemap link is present on some preview routes but not others, so users cannot reach it the same way on every page (RGAA 12.4).",
        ),
      );
    } else {
      const sitemapPositions = new Set(sitemapSignatures(snapshots));
      if (sitemapPositions.size > 1) {
        findings.push(
          siteFinding(
            "consistent-sitemap",
            pages,
            "Sitemap entry point position differs between routes",
            "The sitemap link appears in a different location across the configured preview routes (RGAA 12.4).",
          ),
        );
      }
    }
  }

  const searchPages = snapshots.filter((snapshot) => snapshot.searchSelector);
  if (searchPages.length > 0) {
    if (searchPages.length < snapshots.length) {
      findings.push(
        siteFinding(
          "consistent-search",
          pages,
          "Search control missing on some routes",
          "Search is present on some preview routes but not others, so users cannot reach it the same way on every page (RGAA 12.5).",
        ),
      );
    } else {
      const uniqueSearchSelectors = new Set(searchSignatures(snapshots));
      if (uniqueSearchSelectors.size > 1) {
        findings.push(
          siteFinding(
            "consistent-search",
            pages,
            "Search control position differs between routes",
            "The search control appears in a different location across the configured preview routes (RGAA 12.5).",
          ),
        );
      }
    }
  }

  const missingLandmarks: string[] = [];
  if (checkCrossRouteLandmark(snapshots, "main")) {
    missingLandmarks.push("main");
  }
  if (checkCrossRouteLandmark(snapshots, "banner")) {
    missingLandmarks.push("header (banner)");
  }
  if (missingLandmarks.length > 0) {
    findings.push(
      siteFinding(
        "consistent-landmarks",
        pages,
        `Missing landmarks: ${missingLandmarks.join(", ")}`,
        `Some preview routes are missing ${missingLandmarks.join(" or ")} landmarks that other routes expose (RGAA 12.6).`,
      ),
    );
  }

  const nonemptyTitles = snapshots
    .map((snapshot) => snapshot.title.trim())
    .filter((title) => title.length > 0);
  const uniqueTitles = new Set(nonemptyTitles);
  if (nonemptyTitles.length >= 2 && uniqueTitles.size === 1) {
    const title = nonemptyTitles[0]!;
    findings.push({
      checkId: "duplicate-page-title",
      kind: "warning",
      severity: "moderate",
      confidence: "medium",
      reason: `Every audited route uses the same document title (“${title}”), so users cannot tell pages apart (RGAA 8.6 / WCAG 2.4.2).`,
      location: {
        kind: "site",
        pages,
        detail: `Repeated title: ${title}`,
      },
      fix: null,
      engine: "runtime",
      analyzerId: "site-level",
    });
  }

  const langs = snapshots
    .map((snapshot) => snapshot.htmlLang.trim())
    .filter((lang) => lang.length > 0);
  const uniqueLangs = new Set(langs);
  if (langs.length >= 2 && uniqueLangs.size > 1) {
    findings.push({
      checkId: "consistent-lang",
      kind: "warning",
      severity: "moderate",
      confidence: "medium",
      reason: `Default document languages differ across preview routes (${[...uniqueLangs].join(", ")}). Localized URLs may do this intentionally — review that each route's lang matches its content. This is not an RGAA 8.4 validity failure.`,
      location: {
        kind: "site",
        pages,
        detail: `Languages: ${[...uniqueLangs].join(", ")}`,
      },
      fix: null,
      engine: "runtime",
      analyzerId: "site-level",
    });
  }

  const routesMissingH1 = snapshots
    .filter((snapshot) => !snapshot.pageHeading)
    .map((snapshot) => snapshot.url);
  if (routesMissingH1.length > 0 && routesMissingH1.length < snapshots.length) {
    findings.push(
      siteFinding(
        "consistent-page-heading",
        pages,
        `Missing h1 on: ${routesMissingH1.join(", ")}`,
        "Some preview routes expose a primary heading while others do not.",
      ),
    );
  }

  const headingToTitles = new Map<string, Set<string>>();
  for (const snapshot of snapshots) {
    const heading = snapshot.pageHeading?.trim();
    const title = snapshot.title.trim();
    if (!heading || !title) continue;
    const titles = headingToTitles.get(heading) ?? new Set<string>();
    titles.add(title);
    headingToTitles.set(heading, titles);
  }
  for (const [heading, titles] of headingToTitles) {
    if (titles.size <= 1) continue;
    findings.push(
      siteFinding(
        "consistent-page-heading",
        pages,
        `Shared h1 “${heading}” across ${titles.size} different titles`,
        `The same primary heading (“${heading}”) appears on routes whose document titles differ, so page identity is unclear.`,
      ),
    );
    break;
  }

  return findings;
}
