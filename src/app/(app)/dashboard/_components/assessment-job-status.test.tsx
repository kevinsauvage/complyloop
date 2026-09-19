import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/assessment", () => ({
  runAssessmentAction: vi.fn(),
  cancelAssessmentJobAction: vi.fn(),
}));

import type { AssessmentJob } from "@/core/assessment-jobs";
import { renderWithUiProviders } from "@/test-fixtures/render-ui";

import { AssessmentJobStatus } from "./assessment-job-status";

afterEach(() => {
  cleanup();
});

function jobOf(
  overrides: Partial<AssessmentJob> & { id: string },
): AssessmentJob {
  const now = new Date().toISOString();
  return {
    projectId: "p1",
    status: "queued",
    trigger: "manual",
    payload: {},
    attempts: 0,
    maxAttempts: 3,
    availableAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function minutesAhead(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

describe("AssessmentJobStatus worker-stall warning", () => {
  it("warns when a queued job has been ready longer than 10 minutes", () => {
    renderWithUiProviders(
      <AssessmentJobStatus
        jobs={[jobOf({ id: "j1", availableAt: minutesAgo(25) })]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /worker may be stopped/i,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/25 min/);
  });

  it("stays quiet for a freshly queued job", () => {
    renderWithUiProviders(
      <AssessmentJobStatus
        jobs={[jobOf({ id: "j1", availableAt: minutesAgo(1) })]}
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getAllByText(/queued/i).length).toBeGreaterThan(0);
  });

  it("ignores scheduled retries whose availableAt is in the future", () => {
    renderWithUiProviders(
      <AssessmentJobStatus
        jobs={[
          jobOf({
            id: "j1",
            attempts: 1,
            availableAt: minutesAhead(5),
            createdAt: minutesAgo(30),
          }),
        ]}
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders nothing when there are no jobs and no poll error", () => {
    const { container } = renderWithUiProviders(
      <AssessmentJobStatus jobs={[]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("AssessmentJobStatus stage progress", () => {
  it("shows the pipeline stage for a running job", () => {
    renderWithUiProviders(
      <AssessmentJobStatus
        jobs={[
          jobOf({
            id: "j1",
            status: "running",
            startedAt: minutesAgo(1),
            payload: { stage: "ast" },
          }),
        ]}
      />,
    );

    expect(screen.getByText(/Scanning source/)).toBeInTheDocument();
  });

  it("hides the stage for terminal jobs", () => {
    renderWithUiProviders(
      <AssessmentJobStatus
        jobs={[
          jobOf({
            id: "j1",
            status: "succeeded",
            payload: { stage: "apply" },
          }),
        ]}
      />,
    );

    expect(screen.queryByText(/Saving results/)).toBeNull();
    expect(screen.getByText(/Completed/)).toBeInTheDocument();
  });
});

describe("AssessmentJobStatus cancel", () => {
  it("renders a cancel form for queued and running jobs when allowed", () => {
    const { container } = renderWithUiProviders(
      <AssessmentJobStatus
        jobs={[
          jobOf({ id: "j1" }),
          jobOf({ id: "j2", status: "running", startedAt: minutesAgo(1) }),
          jobOf({ id: "j3", status: "succeeded" }),
        ]}
        canCancel
      />,
    );

    expect(screen.getAllByRole("button", { name: /cancel job/i })).toHaveLength(
      2,
    );
    const hidden = container.querySelectorAll('input[name="jobId"]');
    expect([...hidden].map((input) => input.getAttribute("value"))).toEqual([
      "j1",
      "j2",
    ]);
  });

  it("renders no cancel control without permission or for terminal jobs", () => {
    renderWithUiProviders(
      <AssessmentJobStatus
        jobs={[
          jobOf({ id: "j1" }),
          jobOf({ id: "j2", status: "failed", error: "boom" }),
          jobOf({ id: "j3", status: "cancelled" }),
        ]}
      />,
    );

    expect(screen.queryByRole("button", { name: /cancel job/i })).toBeNull();
  });
});

describe("AssessmentJobStatus running-age note", () => {
  it("explains a scan running far past the stall threshold", () => {
    renderWithUiProviders(
      <AssessmentJobStatus
        jobs={[
          jobOf({ id: "j1", status: "running", startedAt: minutesAgo(25) }),
        ]}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/running for 25 min/i);
  });

  it("stays quiet for a freshly started scan", () => {
    renderWithUiProviders(
      <AssessmentJobStatus
        jobs={[
          jobOf({ id: "j1", status: "running", startedAt: minutesAgo(1) }),
        ]}
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("computes long-running age from an injectable clock", async () => {
    const { longRunningAgeMs } = await import("./assessment-job-status");
    expect(longRunningAgeMs(minutesAgo(25), Date.now())).toBeGreaterThan(0);
    expect(longRunningAgeMs(minutesAgo(1), Date.now())).toBeNull();
    expect(longRunningAgeMs("not-a-date", Date.now())).toBeNull();
  });
});
