import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { EvidenceRecord } from "@complyloop/analysis-core/contract/entities";

import { testControl } from "@/test-fixtures/control";
import { renderWithUiProviders } from "@/test-fixtures/render-ui";

import {
  DashboardActivityFeed,
  DashboardRegressionsBanner,
} from "./dashboard-activity-sections";

afterEach(() => {
  cleanup();
});

function evidence(partial: Partial<EvidenceRecord>): EvidenceRecord {
  return {
    id: "e1",
    at: "2026-10-19T21:39:00.000Z",
    kind: "requirement_status_changed",
    summary: "",
    ...partial,
  };
}

const fileList = Array.from(
  { length: 40 },
  (_, index) => `app/fixtures/file-${index}.tsx`,
);

const regression = evidence({
  id: "regression-1",
  controlId: "c1",
  summary: `RGAA 11.9 (Buttons have an accessible name): passed → failed — compliance regression — ${fileList.length} file(s) changed: ${fileList.join(", ")}`,
  detail: {
    from: "passed",
    to: "failed",
    regression: true,
    changeContext: `${fileList.length} file(s) changed: ${fileList.join(", ")}`,
  },
});

describe("DashboardRegressionsBanner", () => {
  it("names the regression and summarises the change instead of dumping the file list", () => {
    renderWithUiProviders(
      <DashboardRegressionsBanner
        regressions={[regression]}
        controlById={() =>
          testControl({ title: "Buttons have an accessible name" })
        }
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: /1 regression since the last assessment/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Buttons have an accessible name"),
    ).toBeInTheDocument();
    expect(screen.getByText("40 files changed")).toBeInTheDocument();
    expect(
      screen.getByText(/regressed from passed to failed/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/file-7\.tsx/)).toBeNull();
  });

  it("renders nothing without regressions", () => {
    const { container } = renderWithUiProviders(
      <DashboardRegressionsBanner
        regressions={[]}
        controlById={() => testControl()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("DashboardActivityFeed", () => {
  it("drops job lifecycle entries that repeat the assessment result", () => {
    const completedAt = "2026-10-20T16:07:00.000Z";
    const records = [
      evidence({
        id: "job-completed",
        at: completedAt,
        kind: "assessment_job",
        summary: "Assessment job abc completed",
        detail: { phase: "completed", jobId: "abc" },
      }),
      evidence({
        id: "assessment-completed",
        at: completedAt,
        kind: "assessment_completed",
        summary: 'Assessment of "next-portfolio": 90 files scanned',
      }),
    ];

    renderWithUiProviders(
      <DashboardActivityFeed recentVerified={[]} recentEvidence={records} />,
    );

    const feed = screen.getByRole("list", { hidden: false });
    expect(within(feed).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Assessment completed")).toBeInTheDocument();
    expect(screen.queryByText("Assessment job completed")).toBeNull();
  });

  it("keeps a failed job visible", () => {
    renderWithUiProviders(
      <DashboardActivityFeed
        recentVerified={[]}
        recentEvidence={[
          evidence({
            id: "job-failed",
            kind: "assessment_job",
            summary: "Assessment job abc failed",
            detail: { phase: "failed", jobId: "abc" },
          }),
        ]}
      />,
    );

    expect(screen.getByText("Assessment job failed")).toBeInTheDocument();
  });
});
