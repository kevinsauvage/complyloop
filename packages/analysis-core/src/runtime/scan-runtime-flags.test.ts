import { afterEach, describe, expect, it, vi } from "vitest";

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
        },
        {
          url: "https://preview.example.com/about",
          violations: [],
          htmlValidateRan: true,
          htmlValidateFindings: [],
        },
      ],
    });

    expect(result.pagesScanned).toBe(2);
    expect(result.htmlValidateRan).toBe(true);
    expect(result.findings.some((f) => f.checkId === "input-label")).toBe(true);
  });

  describe("serverless browser guard", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("fails fast on Vercel without ASSESSMENT_RUNTIME_BROWSER=serverless", async () => {
      vi.stubEnv("VERCEL", "1");
      vi.stubEnv("ASSESSMENT_RUNTIME_BROWSER", "");
      const result = await scanRuntime({
        runtimeBaseUrl: "https://preview.example.com",
        runtimeRoutes: ["/"],
        lookup: publicLookup,
      });
      expect(result.pagesScanned).toBe(0);
      expect(result.error).toMatch(/ASSESSMENT_RUNTIME_BROWSER=serverless/);
    });
  });
});
