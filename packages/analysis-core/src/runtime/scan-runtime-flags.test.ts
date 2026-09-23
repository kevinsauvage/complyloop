import { describe, expect, it } from "vitest";

import { scanRuntime } from "./scan";
import type { DnsLookup } from "./url-safety";

const publicLookup: DnsLookup = async () => [
  { address: "93.184.216.34", family: 4 },
];

describe("scanRuntime engine flags", () => {
  it("aggregates htmlValidateRan from per-page success", async () => {
    const result = await scanRuntime({
      runtimeBaseUrl: "https://preview.example.com",
      runtimeRoutes: ["/", "/about"],
      lookup: publicLookup,
      scanner: async () => ({
        pages: [
          {
            url: "https://preview.example.com/",
            violations: [
              {
                id: "label",
                impact: "critical",
                description: "Labels",
                help: "Labels",
                nodes: [{ html: "<input>", target: ["input"] }],
              },
            ],
            htmlValidateRan: false,
          },
          {
            url: "https://preview.example.com/about",
            violations: [],
            htmlValidateRan: true,
            htmlValidateFindings: [],
          },
        ],
        pageFailures: [],
      }),
    });

    expect(result.pagesScanned).toBe(2);
    expect(result.htmlValidateRan).toBe(true);
    expect(result.findings.some((f) => f.checkId === "input-label")).toBe(true);
  });

  it("keeps sibling pages when one page fails and reports the failure", async () => {
    const result = await scanRuntime({
      runtimeBaseUrl: "https://preview.example.com",
      runtimeRoutes: ["/", "/about"],
      lookup: publicLookup,
      scanner: async () => ({
        pages: [
          {
            url: "https://preview.example.com/about",
            violations: [],
            htmlValidateRan: false,
          },
        ],
        pageFailures: [
          { url: "https://preview.example.com/", error: "axe crashed: OOM" },
        ],
      }),
    });

    expect(result.pagesScanned).toBe(1);
    expect(result.error).toBeUndefined();
    expect(result.pageFailures).toEqual([
      { url: "https://preview.example.com/", error: "axe crashed: OOM" },
    ]);
  });

  it("fails the scan when every page fails", async () => {
    const result = await scanRuntime({
      runtimeBaseUrl: "https://preview.example.com",
      runtimeRoutes: ["/"],
      lookup: publicLookup,
      scanner: async () => ({
        pages: [],
        pageFailures: [
          { url: "https://preview.example.com/", error: "axe crashed: OOM" },
        ],
      }),
    });

    expect(result.pagesScanned).toBe(0);
    expect(result.error).toBeDefined();
    expect(result.pageFailures).toHaveLength(1);
  });
});
