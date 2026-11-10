import { describe, expect, it, vi } from "vitest";

import { testControl } from "@/test-fixtures/control";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";

vi.mock("server-only", () => ({}));

import { statusSummary, type StatusSummaryInput } from "./status-summary";

function input(partial: Partial<StatusSummaryInput> = {}): StatusSummaryInput {
  return {
    project: testProject({
      github: {
        fullName: "acme/shop",
        defaultBranch: "main",
        private: false,
      },
    }),
    latestAssessment: {
      completedAt: "2026-11-10T17:22:00.000Z",
      filesScanned: 42,
    },
    counts: {
      passed: 8,
      failed: 1,
      needs_review: 0,
      not_applicable: 2,
      unable_to_verify: 1,
    },
    trend: [{ passRate: 70 }, { passRate: 80 }],
    openCount: 0,
    regressionCount: 0,
    topFindings: [],
    origin: "https://app.example",
    ...partial,
  };
}

describe("statusSummary", () => {
  it("summarises repo, assessment, pass rate delta and requirement counts", () => {
    const text = statusSummary(input());

    expect(text).toContain("**Accessibility status — acme/shop** (`main`)");
    expect(text).toContain("Assessed 10 Nov 2026");
    expect(text).toContain("· 42 files");
    // 8 passed of 10 applicable (not_applicable excluded) = 80%; previous 70%.
    expect(text).toContain(
      "- Pass rate: **80%** (▲ 10 pts since the previous run)",
    );
    expect(text).toContain(
      "- Requirements: 8 passed · 1 failed · 2 not applicable · 1 unable to verify",
    );
    expect(text).toContain("- Open findings: 0");
    expect(text).not.toContain("Regressions");
    expect(text).not.toContain("Top open findings");
    expect(text).toContain("Dashboard: https://app.example/dashboard");
  });

  it("reports a drop and an unchanged rate", () => {
    expect(
      statusSummary(input({ trend: [{ passRate: 90 }, { passRate: 80 }] })),
    ).toContain("(▼ 10 pts since the previous run)");
    expect(
      statusSummary(input({ trend: [{ passRate: 80 }, { passRate: 80 }] })),
    ).toContain("(unchanged since the previous run)");
    expect(statusSummary(input({ trend: [{ passRate: 80 }] }))).toContain(
      "- Pass rate: **80%**\n",
    );
  });

  it("lists the top open findings with links and counts the rest", () => {
    const topFindings = Array.from({ length: 6 }, (_, index) => ({
      finding: testFinding({ id: `f${index}` }),
      control: testControl({ code: "WCAG 1.1.1", title: "Images" }),
    }));
    const text = statusSummary(
      input({ openCount: 9, regressionCount: 2, topFindings }),
    );

    expect(text).toContain("- Regressions: 2");
    expect(text).toContain(
      "1. [serious] WCAG 1.1.1 — Images · `App.tsx:1` — https://app.example/findings/f0",
    );
    expect(text).toContain("5. [serious]");
    expect(text).not.toContain("6. [serious]");
    expect(text).toContain("…and 4 more open findings.");
  });

  it("uses the project name without a GitHub repo", () => {
    const text = statusSummary(
      input({ project: testProject({ name: "Local" }) }),
    );
    expect(text).toContain("**Accessibility status — Local**\n");
  });
});
