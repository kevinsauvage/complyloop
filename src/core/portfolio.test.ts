import { describe, expect, it } from "vitest";

import {
  matchesPortfolioFilter,
  parsePortfolioFilter,
  type PortfolioSignals,
  summarizePortfolio,
} from "./portfolio";

function signals(overrides: Partial<PortfolioSignals> = {}): PortfolioSignals {
  return {
    attention: 0,
    openViolations: 0,
    unreadAlerts: 0,
    lastCompletedAt: "2026-02-01T12:00:00.000Z",
    latestJobStatus: "succeeded",
    ...overrides,
  };
}

describe("parsePortfolioFilter", () => {
  it("accepts known filters and falls back to all", () => {
    expect(parsePortfolioFilter("never")).toBe("never");
    expect(parsePortfolioFilter(["pipeline", "never"])).toBe("pipeline");
    expect(parsePortfolioFilter("bogus")).toBeNull();
    expect(parsePortfolioFilter(undefined)).toBeNull();
  });
});

describe("matchesPortfolioFilter", () => {
  it("flags attention on verdicts or open violations", () => {
    expect(matchesPortfolioFilter(signals(), "attention")).toBe(false);
    expect(matchesPortfolioFilter(signals({ attention: 1 }), "attention")).toBe(
      true,
    );
    expect(
      matchesPortfolioFilter(signals({ openViolations: 2 }), "attention"),
    ).toBe(true);
  });

  it("matches never-assessed and failed pipelines; unknown statuses are not failures", () => {
    expect(
      matchesPortfolioFilter(signals({ lastCompletedAt: null }), "never"),
    ).toBe(true);
    expect(
      matchesPortfolioFilter(
        signals({ latestJobStatus: "failed" }),
        "pipeline",
      ),
    ).toBe(true);
    expect(
      matchesPortfolioFilter(signals({ latestJobStatus: "weird" }), "pipeline"),
    ).toBe(false);
  });
});

describe("summarizePortfolio", () => {
  it("totals violations and alerts and counts projects per filter", () => {
    const summary = summarizePortfolio([
      signals({ attention: 2, openViolations: 3, unreadAlerts: 1 }),
      signals({ lastCompletedAt: null, latestJobStatus: null }),
      signals({
        latestJobStatus: "failed",
        openViolations: 1,
        unreadAlerts: 2,
      }),
    ]);
    expect(summary).toEqual({
      projects: 3,
      openViolations: 4,
      unreadAlerts: 3,
      byFilter: { attention: 2, never: 1, pipeline: 1 },
    });
  });
});
