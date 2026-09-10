import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { rgaaControls, rgaaFramework } from "@complyloop/analysis-core/adapters/rgaa/controls";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";

import { AssessedRequirementList } from "./assessed-requirement-list";

vi.mock("./requirement-card", () => ({
  RequirementCard: ({
    control,
  }: {
    control: { title: string };
  }) => <article>{control.title}</article>,
}));

afterEach(() => {
  cleanup();
});

function requirementFor(controlId: string): Requirement {
  return {
    id: `req-${controlId}`,
    projectId: "p1",
    controlId,
    status: "passed",
    determination: "automated",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("AssessedRequirementList", () => {
  it("renders theme headings for in-scope controls", () => {
    const img = rgaaControls.find((control) => control.id === "ctl-img-alt");
    const form = rgaaControls.find((control) => control.id === "ctl-input-label");
    if (!img || !form) throw new Error("expected controls");

    render(
      <AssessedRequirementList
        controls={[img, form]}
        requirements={[requirementFor(img.id), requirementFor(form.id)]}
        openFindingCounts={new Map()}
        frameworkId={rgaaFramework.id}
        canRemediate={false}
        project={{ runtimeBaseUrl: undefined }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Images" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Forms" })).toBeInTheDocument();
    expect(screen.getByText(img.title)).toBeInTheDocument();
    expect(screen.getByText(form.title)).toBeInTheDocument();
  });
});
