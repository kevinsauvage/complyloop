import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rgaaControls, rgaaFramework } from "@/adapters/rgaa/controls";
import { RequirementsIntakePanel } from "./requirements-intake-panel";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/server/actions/requirements-intake", () => ({
  applyFrameworkPresetAction: vi.fn(),
  importChecklistAction: vi.fn(),
  importCustomControlAction: vi.fn(),
  updateRequirementScopeAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

const allIds = new Set(rgaaControls.map((control) => control.id));

describe("RequirementsIntakePanel", () => {
  it("explains view-only access without intake actions", () => {
    render(
      <RequirementsIntakePanel
        canAssess={false}
        controls={rgaaControls}
        frameworks={[rgaaFramework]}
        inScope={allIds}
        hasExplicitScope={false}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/view-only/i);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("keeps all four intake tabs in the tab list", () => {
    render(
      <RequirementsIntakePanel
        canAssess
        controls={rgaaControls}
        frameworks={[rgaaFramework]}
        inScope={allIds}
        hasExplicitScope={false}
      />,
    );

    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("tab", { name: "Custom" })).toBeInTheDocument();
  });

  it("does not offer adding a preset that is already the full implicit scope", () => {
    render(
      <RequirementsIntakePanel
        canAssess
        controls={rgaaControls}
        frameworks={[rgaaFramework]}
        inScope={allIds}
        hasExplicitScope={false}
      />,
    );

    expect(screen.getByText("Current scope")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add .*full rgaa/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use only Images & media" }),
    ).toBeInTheDocument();
  });

  it("groups scope checkboxes by framework", async () => {
    const user = userEvent.setup();
    render(
      <RequirementsIntakePanel
        canAssess
        controls={rgaaControls}
        frameworks={[rgaaFramework]}
        inScope={allIds}
        hasExplicitScope={false}
      />,
    );

    await user.click(screen.getByRole("tab", { name: "Scope" }));
    expect(
      screen.getByRole("group", { name: rgaaFramework.name }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save scope" }),
    ).toBeInTheDocument();
  });
});
