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
    navLinks: [],
    helpLinks: [],
    searchInputs: [],
    sitemapLinks: [],
    formFields: [],
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

  it("flags inconsistent navigation signatures", () => {
    const findings = runSiteLevelChecks([
      snapshot("https://x.test/a", {
        navLinks: ["Home::/", "About::/about"],
      }),
      snapshot("https://x.test/b", {
        navLinks: ["About::/about", "Home::/"],
      }),
    ]);
    expect(findings.some((finding) => finding.checkId === "consistent-nav")).toBe(
      true,
    );
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
});
