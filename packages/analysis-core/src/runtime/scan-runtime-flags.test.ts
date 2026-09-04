import { describe, expect, it } from "vitest";
import { scanRuntime } from "./scan";
import type { DnsLookup } from "./url-safety";

const publicLookup: DnsLookup = async () => [
  { address: "93.184.216.34", family: 4 },
];

describe("scanRuntime engine flags", () => {
  it("aggregates htmlValidateRan and ibmCheckerRan from per-page success", async () => {
    const result = await scanRuntime({
      runtimeBaseUrl: "https://preview.example.com",
      runtimeRoutes: ["/", "/about"],
      lookup: publicLookup,
      scanner: async () => [
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
          ibmCheckerRan: true,
          ibmFindings: [],
        },
        {
          url: "https://preview.example.com/about",
          violations: [],
          htmlValidateRan: true,
          ibmCheckerRan: false,
          htmlValidateFindings: [],
        },
      ],
    });

    expect(result.pagesScanned).toBe(2);
    expect(result.htmlValidateRan).toBe(true);
    expect(result.ibmCheckerRan).toBe(true);
    expect(result.findings.some((f) => f.checkId === "input-label")).toBe(true);
  });
});
