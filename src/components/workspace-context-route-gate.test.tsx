import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/dashboard"),
}));

import { usePathname } from "next/navigation";
import { WorkspaceContextRouteGate } from "./workspace-context-route-gate";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("WorkspaceContextRouteGate", () => {
  it("hides children on the dashboard route", () => {
    vi.mocked(usePathname).mockReturnValue("/dashboard");
    render(
      <WorkspaceContextRouteGate>
        <span>Workspace strip</span>
      </WorkspaceContextRouteGate>,
    );
    expect(screen.queryByText("Workspace strip")).not.toBeInTheDocument();
  });

  it("shows children on other app routes", () => {
    vi.mocked(usePathname).mockReturnValue("/findings");
    render(
      <WorkspaceContextRouteGate>
        <span>Workspace strip</span>
      </WorkspaceContextRouteGate>,
    );
    expect(screen.getByText("Workspace strip")).toBeInTheDocument();
  });
});
