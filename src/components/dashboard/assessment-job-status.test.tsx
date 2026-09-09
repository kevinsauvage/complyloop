import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/actions/assessment", () => ({
  runAssessmentAction: vi.fn(),
}));

import type { AssessmentJob } from "@/core/assessment-job";
import { renderWithUiProviders } from "@/test/render-ui";
import { AssessmentJobStatus } from "./assessment-job-status";

afterEach(() => {
  cleanup();
});

function jobOf(overrides: Partial<AssessmentJob> & { id: string }): AssessmentJob {
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
    const { container } = renderWithUiProviders(<AssessmentJobStatus jobs={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
