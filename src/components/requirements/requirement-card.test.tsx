import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Requirement } from "@complyloop/analysis-core/contract/entities";
import type { Control } from "@complyloop/analysis-core/contract/project-types";

import { TooltipProvider } from "@/components/ui/tooltip";

import { RequirementCard } from "./requirement-card";

vi.mock("@/server/actions/requirements", () => ({
  clearRequirementExceptionAction: vi.fn(),
  clearRequirementHumanPassAction: vi.fn(),
  markRequirementExceptionAction: vi.fn(),
  markRequirementPassedAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

function renderCard(props: ComponentProps<typeof RequirementCard>) {
  return render(
    <TooltipProvider>
      <RequirementCard {...props} />
    </TooltipProvider>,
  );
}

const control: Control = {
  id: "ctl-img-alt",
  frameworkId: "fw-rgaa",
  code: "1.1",
  secondaryCode: "RGAA-1.1",
  title: "Images have a text alternative",
  description: "Every image must have alt text.",
  checkId: "img-alt",
};

function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: "req-1",
    projectId: "p1",
    controlId: control.id,
    status: "failed",
    determination: "automated",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("RequirementCard", () => {
  it("links open findings to the findings list filtered by control", () => {
    renderCard({
      control,
      requirement: requirement(),
      openCount: 3,
      canRemediate: false,
      project: { runtimeBaseUrl: undefined },
    });

    const openFindings = screen.getByRole("link", { name: "3 open findings" });
    expect(openFindings).toHaveAttribute(
      "href",
      "/findings?control=ctl-img-alt",
    );
  });

  it("does not link when there are zero open findings", () => {
    renderCard({
      control,
      requirement: requirement({ status: "passed" }),
      openCount: 0,
      canRemediate: false,
      project: { runtimeBaseUrl: undefined },
    });

    expect(screen.queryByRole("link", { name: /open finding/i })).toBeNull();
    expect(screen.getByText(/no open findings/i)).toBeInTheDocument();
  });

  it("shows See findings as the primary action for failed requirements", () => {
    renderCard({
      control,
      requirement: requirement(),
      openCount: 2,
      canRemediate: false,
      project: { runtimeBaseUrl: undefined },
    });

    const seeFindings = screen.getByRole("link", { name: "See findings" });
    expect(seeFindings).toHaveAttribute(
      "href",
      "/findings?control=ctl-img-alt",
    );
  });

  it("tells reviewers that pertinence still needs a human", () => {
    renderCard({
      control: {
        id: "ctl-img-alt-relevant",
        frameworkId: "fw-rgaa",
        code: "RGAA 1.3",
        secondaryCode: "WCAG 1.1.1",
        title: "Image text alternatives are pertinent",
        description:
          "Each informative image's text alternative describes its purpose.",
        checkId: null,
      },
      requirement: requirement({
        controlId: "ctl-img-alt-relevant",
        status: "unable_to_verify",
      }),
      openCount: 0,
      canRemediate: false,
      project: { runtimeBaseUrl: undefined },
    });

    expect(
      screen.getByText("Presence checked; pertinence needs a human."),
    ).toBeInTheDocument();
  });
});
