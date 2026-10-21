import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Requirement } from "@complyloop/analysis-core/contract/entities";

import { testControl } from "@/test-fixtures/control";
import { renderWithUiProviders } from "@/test-fixtures/render-ui";

import { RequirementRemediationActions } from "./requirement-remediation-actions";

vi.mock("@/server/actions/requirements", () => ({
  clearRequirementExceptionAction: vi.fn(),
  clearRequirementHumanPassAction: vi.fn(),
  markRequirementExceptionAction: vi.fn(),
  markRequirementPassedAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

function baseRequirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: "req-1",
    projectId: "p1",
    controlId: "ctl-1",
    status: "unable_to_verify",
    determination: "automated",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("RequirementRemediationActions", () => {
  it("shows an editor restriction when the user cannot remediate and there is no sticky decision", () => {
    renderWithUiProviders(
      <RequirementRemediationActions
        control={testControl({ id: "ctl-1", checkId: null })}
        requirement={baseRequirement()}
        exceptionLapsed={false}
        canRemediate={false}
      />,
    );
    expect(
      screen.getByText("Only editors can record passes or exceptions."),
    ).toBeInTheDocument();
  });

  it("shows human-pass recording for manual controls when remediating", async () => {
    const user = userEvent.setup();
    renderWithUiProviders(
      <RequirementRemediationActions
        control={testControl({ id: "ctl-1", checkId: null })}
        requirement={baseRequirement()}
        exceptionLapsed={false}
        canRemediate
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /mark as passed by human review/i }),
    );
    expect(
      screen.getAllByRole("button", { name: /mark as passed by human review/i })
        .length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText(/evidence note/i)).toBeInTheDocument();
  });

  it("shows clear action when a human pass is already recorded", () => {
    renderWithUiProviders(
      <RequirementRemediationActions
        control={testControl({ id: "ctl-1", checkId: null })}
        requirement={baseRequirement({
          humanPass: {
            note: "Reviewed manually",
            at: "2026-01-02T00:00:00.000Z",
          },
        })}
        exceptionLapsed={false}
        canRemediate
      />,
    );

    expect(screen.getByText(/human pass recorded/i)).toBeInTheDocument();
    expect(screen.getByText("Reviewed manually")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /clear human pass/i,
      }),
    ).toBeInTheDocument();
  });

  it("marks a temporary exception past its expiry as expired", () => {
    renderWithUiProviders(
      <RequirementRemediationActions
        control={testControl({ id: "ctl-1" })}
        requirement={baseRequirement({
          determination: "human_review",
          exception: {
            reason: "temporary",
            note: "Fix scheduled",
            at: "2026-01-02T00:00:00.000Z",
            expiresAt: "2026-01-10T23:59:59.999Z",
          },
        })}
        exceptionLapsed
        canRemediate={false}
      />,
    );

    expect(screen.getByText(/\(expired\)/)).toBeInTheDocument();
    expect(screen.getByText(/no longer holds/i)).toBeInTheDocument();
  });
});
