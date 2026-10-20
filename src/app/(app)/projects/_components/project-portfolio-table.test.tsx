import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PortfolioRow } from "@/server/workspace/portfolio-view";
import { testProject } from "@/test-fixtures/project";
import { renderWithUiProviders } from "@/test-fixtures/render-ui";

// Static import: the module transform must not run inside a test body, where
// it counts against the per-test timeout under parallel load.
import { ProjectPortfolioTable } from "./project-portfolio-table";

vi.mock("@/server/actions/connect", () => ({
  openProjectAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

function row(
  overrides: Partial<PortfolioRow> & { name?: string } = {},
): PortfolioRow {
  const { name = "Shop", ...rest } = overrides;
  const projectId = rest.projectId ?? "p1";
  return {
    projectId,
    project: testProject({ id: projectId, name }),
    attention: 3,
    requirements: {
      passed: 4,
      failed: 2,
      needs_review: 1,
      not_applicable: 0,
      unable_to_verify: 3,
    },
    openViolations: 5,
    unreadAlerts: 1,
    lastCompletedAt: "2026-02-01T12:00:00.000Z",
    latestJobStatus: "failed",
    latestJobAt: "2026-02-01T12:00:00.000Z",
    ...rest,
  };
}

describe("ProjectPortfolioTable", () => {
  it("renders one labelled row per project with every verdict count", () => {
    renderWithUiProviders(
      <ProjectPortfolioTable
        rows={[row({ name: "Alpha" }), row({ projectId: "p2", name: "Beta" })]}
      />,
    );

    const table = screen.getByRole("table", {
      name: /compliance state for every project/i,
    });
    // Header row + one row per project.
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(
      within(table).getByRole("rowheader", { name: /Alpha/ }),
    ).toBeTruthy();
    expect(within(table).getByRole("rowheader", { name: /Beta/ })).toBeTruthy();

    const alpha = within(table).getByRole("row", { name: /Alpha/ });
    const cells = within(alpha).getAllByRole("cell");
    // failed · needs_review · unable_to_verify · passed · not_applicable ·
    // open violations · unread alerts · last assessment · pipeline · open
    expect(cells.slice(0, 5).map((cell) => cell.textContent?.trim())).toEqual([
      "2",
      "1",
      "3",
      "4",
      "0",
    ]);
    expect(cells[5]?.textContent?.trim()).toBe("5");
    expect(cells[6]?.textContent?.trim()).toBe("1");
  });

  it("shows never-assessed projects without a pipeline status", () => {
    renderWithUiProviders(
      <ProjectPortfolioTable
        rows={[
          row({
            name: "Fresh",
            lastCompletedAt: null,
            latestJobStatus: null,
            latestJobAt: null,
          }),
        ]}
      />,
    );

    const fresh = screen.getByRole("row", { name: /Fresh/ });
    expect(within(fresh).getByText(/never assessed/i)).toBeTruthy();
    expect(within(fresh).queryByText("Failed")).toBeNull();
  });

  it("labels the pipeline with the queue status", () => {
    renderWithUiProviders(
      <ProjectPortfolioTable rows={[row({ latestJobStatus: "running" })]} />,
    );

    expect(screen.getByText("Running")).toBeTruthy();
  });

  it("names the open control after its project (WCAG label in name)", () => {
    renderWithUiProviders(
      <ProjectPortfolioTable rows={[row({ name: "Acme Shop" })]} />,
    );

    expect(screen.getByRole("button", { name: "Open Acme Shop" })).toBeTruthy();
  });

  it("carries the project id on the switch form", () => {
    const { container } = renderWithUiProviders(
      <ProjectPortfolioTable rows={[row({ projectId: "p-42" })]} />,
    );

    const hidden = container.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="projectId"]',
    );
    expect(hidden?.value).toBe("p-42");
  });
});
