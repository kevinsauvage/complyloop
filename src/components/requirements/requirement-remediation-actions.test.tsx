import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithUiProviders } from "@/test/render-ui";
import { testControl } from "@/test-fixtures/control";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";
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

function baseRequirement(
  overrides: Partial<Requirement> = {},
): Requirement {
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
  it("hides when the user cannot remediate and there is no sticky decision", () => {
    const { container } = renderWithUiProviders(
      <RequirementRemediationActions
        control={testControl({ id: "ctl-1", checkId: null })}
        requirement={baseRequirement()}
        canRemediate={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows human-pass recording for manual controls when remediating", async () => {
    const user = userEvent.setup();
    renderWithUiProviders(
      <RequirementRemediationActions
        control={testControl({ id: "ctl-1", checkId: null })}
        requirement={baseRequirement()}
        canRemediate
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /mark passed \(human review\)/i }),
    );
    expect(
      screen.getByRole("button", { name: /record human pass/i }),
    ).toBeInTheDocument();
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
        canRemediate
      />,
    );

    expect(screen.getByText(/human pass recorded/i)).toBeInTheDocument();
    expect(screen.getByText("Reviewed manually")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /clear human pass & return to unable to verify/i,
      }),
    ).toBeInTheDocument();
  });
});
