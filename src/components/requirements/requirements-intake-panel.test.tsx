import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequirementsIntakePanel } from "./requirements-intake-panel";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/server/actions/requirements-intake", () => ({
  applyFrameworkPresetAction: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("RequirementsIntakePanel", () => {
  it("explains view-only access without intake actions", () => {
    render(
      <RequirementsIntakePanel
        canAssess={false}
        currentPresetId="preset-rgaa-full"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/view-only/i);
    expect(
      screen.queryByRole("group", { name: /assessment target/i }),
    ).not.toBeInTheDocument();
  });

  it("offers framework and level targets without topical, import, or custom intake", () => {
    render(
      <RequirementsIntakePanel
        canAssess
        currentPresetId="preset-rgaa-full"
      />,
    );

    expect(
      screen.getByRole("group", { name: "Assessment target" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Full RGAA 4/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /RGAA 4 AA / })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Full WCAG 2.1/ })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /Images & media/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Import" })).not.toBeInTheDocument();
    expect(screen.queryByText(/custom control/i)).not.toBeInTheDocument();
  });

  it("offers both RGAA and WCAG level targets", () => {
    render(
      <RequirementsIntakePanel canAssess currentPresetId={undefined} />,
    );

    expect(screen.getByRole("radio", { name: /RGAA 4 AAA/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /WCAG 2.1 AA / })).toBeInTheDocument();
  });
});
