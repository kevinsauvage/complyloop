import { describe, expect, it } from "vitest";

import { runSiteLevelChecks } from "./checks";
import type { RuntimePageSnapshot } from "./types";

function snapshot(
  url: string,
  overrides: Partial<RuntimePageSnapshot> = {},
): RuntimePageSnapshot {
  return {
    url,
    title: url,
    htmlLang: "en",
    elementIds: [],
    fragmentLinks: [],
    navLinks: [],
    helpLinks: [],
    searchInputs: [],
    sitemapLinks: [],
    formFields: [],
    landmarkRoles: [],
    ...overrides,
  };
}

describe("runSiteLevelChecks", () => {
  it("returns no findings with fewer than two pages", () => {
    expect(runSiteLevelChecks([snapshot("https://x.test/")])).toHaveLength(0);
  });

  it("flags fewer than two navigation mechanisms", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", { navLinks: ["Home::/"] }),
      snapshot("https://x.test/b", { navLinks: ["About::/about"] }),
    ]);
    expect(findings.some((finding) => finding.checkId === "multiple-ways")).toBe(
      true,
    );
  });

  it("passes when nav and search exist", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", {
        navLinks: ["Home::/"],
        searchInputs: [{ type: "search" }],
      }),
      snapshot("https://x.test/b", {
        navLinks: ["About::/about"],
        searchInputs: [{ type: "search" }],
      }),
    ]);
    expect(findings.some((finding) => finding.checkId === "multiple-ways")).toBe(
      false,
    );
  });

  it("warns when navigation signatures differ in order", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", {
        navLinks: ["Home::/", "About::/about"],
      }),
      snapshot("https://x.test/b", {
        navLinks: ["About::/about", "Home::/"],
      }),
    ]);
    const navFindings = findings.filter(
      (finding) => finding.checkId === "consistent-nav",
    );
    expect(navFindings).toHaveLength(1);
    expect(navFindings[0]?.kind).toBe("warning");
  });

  it("does not flag when only trailing auth links differ", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", {
        navLinks: ["Home::/", "About::/about", "Logout::/logout"],
      }),
      snapshot("https://x.test/b", {
        navLinks: ["Home::/", "About::/about"],
      }),
    ]);
    expect(findings.some((finding) => finding.checkId === "consistent-nav")).toBe(
      false,
    );
  });

  it("warns when primary navigation content differs", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", {
        navLinks: ["Home::/", "About::/about"],
      }),
      snapshot("https://x.test/b", {
        navLinks: ["Home::/", "Pricing::/pricing"],
      }),
    ]);
    const navFindings = findings.filter(
      (finding) => finding.checkId === "consistent-nav",
    );
    expect(navFindings).toHaveLength(1);
    expect(navFindings[0]?.kind).toBe("warning");
  });

  it("violates when primary navigation is missing on some routes", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", {
        navLinks: ["Home::/", "About::/about"],
      }),
      snapshot("https://x.test/b"),
    ]);
    const navFindings = findings.filter(
      (finding) => finding.checkId === "consistent-nav",
    );
    expect(navFindings).toHaveLength(1);
    expect(navFindings[0]?.kind).toBe("violation");
  });

  it("flags inconsistent labels for the same field name", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", {
        formFields: [{ name: "email", label: "Email" }],
      }),
      snapshot("https://x.test/b", {
        formFields: [{ name: "email", label: "Work email" }],
      }),
    ]);
    expect(
      findings.some((finding) => finding.checkId === "consistent-labels"),
    ).toBe(true);
  });

  it("flags inconsistent help mechanism ordering", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", {
        helpLinks: ["help::/help", "contact::/contact"],
      }),
      snapshot("https://x.test/b", {
        helpLinks: ["contact::/contact", "help::/help"],
      }),
    ]);
    expect(findings.some((finding) => finding.checkId === "consistent-help")).toBe(
      true,
    );
  });

  it("flags sitemap missing on some routes", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", {
        sitemapHref: "/sitemap.xml",
        sitemapPosition: "header>nav>a",
      }),
      snapshot("https://x.test/b"),
    ]);
    expect(
      findings.some((finding) => finding.checkId === "consistent-sitemap"),
    ).toBe(true);
  });

  it("flags sitemap in different positions", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", {
        sitemapHref: "/sitemap.xml",
        sitemapPosition: "header>nav>a",
      }),
      snapshot("https://x.test/b", {
        sitemapHref: "/sitemap.xml",
        sitemapPosition: "footer>a",
      }),
    ]);
    expect(
      findings.some((finding) => finding.checkId === "consistent-sitemap"),
    ).toBe(true);
  });

  it("flags search missing on some routes", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", { searchSelector: "header>input[type=search]" }),
      snapshot("https://x.test/b"),
    ]);
    expect(
      findings.some((finding) => finding.checkId === "consistent-search"),
    ).toBe(true);
  });

  it("flags search in different positions", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", { searchSelector: "header>input[type=search]" }),
      snapshot("https://x.test/b", { searchSelector: "nav>input[type=search]" }),
    ]);
    expect(
      findings.some((finding) => finding.checkId === "consistent-search"),
    ).toBe(true);
  });

  it("flags missing main landmark on some routes", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", { landmarkRoles: ["banner", "navigation", "main"] }),
      snapshot("https://x.test/b", { landmarkRoles: ["banner", "navigation"] }),
    ]);
    expect(
      findings.some((finding) => finding.checkId === "consistent-landmarks"),
    ).toBe(true);
  });

  it("flags missing banner landmark on some routes", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", { landmarkRoles: ["banner", "main"] }),
      snapshot("https://x.test/b", { landmarkRoles: ["main"] }),
    ]);
    expect(
      findings.some((finding) => finding.checkId === "consistent-landmarks"),
    ).toBe(true);
  });

  it("warns when every route shares the same document title", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", { title: "Acme" }),
      snapshot("https://x.test/b", { title: "Acme" }),
    ]);
    const titleFindings = findings.filter(
      (finding) => finding.checkId === "duplicate-page-title",
    );
    expect(titleFindings).toHaveLength(1);
    expect(titleFindings[0]?.kind).toBe("warning");
  });

  it("warns when preview routes declare different default languages", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", { htmlLang: "fr" }),
      snapshot("https://x.test/b", { htmlLang: "en" }),
    ]);
    const langFindings = findings.filter(
      (finding) => finding.checkId === "consistent-lang",
    );
    expect(langFindings).toHaveLength(1);
    expect(langFindings[0]?.kind).toBe("warning");
  });

  it("flags missing h1 on some routes", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", { pageHeading: "Home" }),
      snapshot("https://x.test/b"),
    ]);
    expect(
      findings.some((finding) => finding.checkId === "consistent-page-heading"),
    ).toBe(true);
  });

  it("does not flag shared element ids across preview routes", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", { elementIds: ["header", "nav"] }),
      snapshot("https://x.test/b", { elementIds: ["header", "footer"] }),
    ]);
    expect(findings.some((finding) => finding.checkId === "duplicate-id")).toBe(
      false,
    );
  });

  it("does not flag unique document titles", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", { title: "Home — Acme" }),
      snapshot("https://x.test/b", { title: "About — Acme" }),
    ]);
    expect(
      findings.some((finding) => finding.checkId === "duplicate-page-title"),
    ).toBe(false);
  });
});
