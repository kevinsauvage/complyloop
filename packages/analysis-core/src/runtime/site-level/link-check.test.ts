import { describe, expect, it, vi } from "vitest";

import { brokenLinkFindingsForUrls } from "./link-check";

const checkMock = vi.fn();

vi.mock("linkinator", () => ({
  LinkState: {
    OK: "OK",
    BROKEN: "BROKEN",
    SKIPPED: "SKIPPED",
  },
  check: (...args: unknown[]) => checkMock(...args),
}));

vi.mock("../url-safety.js", () => ({
  assertSafeRuntimeUrl: vi.fn(async () => undefined),
}));

describe("brokenLinkFindingsForUrls", () => {
  it("returns broken same-origin link findings for a preview route", async () => {
    checkMock.mockResolvedValue({
      passed: false,
      links: [
        {
          url: "https://app.example/missing",
          state: "BROKEN",
          status: 404,
          parent: "https://app.example/",
          displayText: "Help",
        },
        {
          url: "https://other.example/page",
          state: "BROKEN",
          status: 404,
          parent: "https://app.example/",
        },
        {
          url: "https://app.example/ok",
          state: "OK",
          status: 200,
          parent: "https://app.example/",
        },
      ],
    });

    const findings = await brokenLinkFindingsForUrls(["https://app.example/"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("broken-link");
    expect(findings[0]?.reason).toContain("404");
    expect(findings[0]?.location).toMatchObject({
      kind: "dom",
      url: "https://app.example/",
    });
  });

  it("flags broken same-page fragment links from snapshots", async () => {
    checkMock.mockResolvedValue({ passed: true, links: [] });

    const findings = await brokenLinkFindingsForUrls(["https://app.example/"], {
      snapshots: [
        {
          url: "https://app.example/",
          title: "Home",
          htmlLang: "en",
          elementIds: ["intro"],
          fragmentLinks: [{ href: "#missing", label: "Skip" }],
          navLinks: [],
          helpLinks: [],
          searchInputs: [],
          sitemapLinks: [],
          formFields: [],
          landmarkRoles: [],
        },
      ],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.checkId).toBe("broken-link");
    expect(findings[0]?.reason).toContain("fragment target missing");
  });

  it("bounds the recursive crawl with a timeout, concurrency, and URL quota", async () => {
    checkMock.mockClear();
    checkMock.mockResolvedValue({ passed: true, links: [] });

    await brokenLinkFindingsForUrls(["https://app.example/"], {
      recurse: true,
      maxUrls: 3,
    });

    expect(checkMock).toHaveBeenCalledTimes(1);
    const checkOptions = checkMock.mock.calls[0]?.[0] as {
      recurse: boolean;
      timeout: number;
      concurrency: number;
      linksToSkip: (linkUrl: string) => Promise<boolean>;
    };
    expect(checkOptions.recurse).toBe(true);
    // A hanging preview page must fail fast instead of stalling the scan.
    expect(checkOptions.timeout).toBeGreaterThan(0);
    expect(checkOptions.concurrency).toBeGreaterThan(0);

    // Seed (1) + two accepted links reach the quota of 3; the rest skip.
    await expect(
      checkOptions.linksToSkip("https://app.example/a"),
    ).resolves.toBe(false);
    await expect(
      checkOptions.linksToSkip("https://app.example/b"),
    ).resolves.toBe(false);
    await expect(
      checkOptions.linksToSkip("https://app.example/c"),
    ).resolves.toBe(true);
    await expect(
      checkOptions.linksToSkip("https://other.example/"),
    ).resolves.toBe(true);
  });

  it("skips malformed fragment encodings without losing other findings", async () => {
    checkMock.mockResolvedValue({ passed: true, links: [] });

    const findings = await brokenLinkFindingsForUrls(["https://app.example/"], {
      snapshots: [
        {
          url: "https://app.example/",
          title: "Home",
          htmlLang: "en",
          elementIds: ["intro"],
          fragmentLinks: [
            { href: "#%zz", label: "Broken" },
            { href: "#missing", label: "Skip" },
          ],
          navLinks: [],
          helpLinks: [],
          searchInputs: [],
          sitemapLinks: [],
          formFields: [],
          landmarkRoles: [],
        },
      ],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toContain("fragment target missing");
  });
});
