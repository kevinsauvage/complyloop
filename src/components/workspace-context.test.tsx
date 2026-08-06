import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/workspace", () => ({
  getWorkspace: vi.fn(async () => ({
    db: {
      organizations: [
        { id: "org-1", name: "Acme", slug: "acme", createdAt: "" },
      ],
    },
    project: {
      id: "p1",
      name: "Shop",
      orgId: "org-1",
      rootPath: "/tmp",
      source: "github",
      createdAt: "",
    },
    visibleProjects: [
      {
        id: "p1",
        name: "Shop",
        orgId: "org-1",
        rootPath: "/tmp",
        source: "github",
        createdAt: "",
      },
      {
        id: "p2",
        name: "Docs",
        orgId: "org-1",
        rootPath: "/tmp",
        source: "github",
        createdAt: "",
      },
    ],
    organizations: [
      { id: "org-1", name: "Acme", slug: "acme", createdAt: "" },
      { id: "org-2", name: "Beta", slug: "beta", createdAt: "" },
    ],
    activeOrgId: "org-1",
  })),
}));

vi.mock("@/components/org-switcher", () => ({
  OrgSwitcher: () => <span>Org switcher</span>,
}));

vi.mock("@/components/project-switcher", () => ({
  ProjectSwitcher: () => <span>Project switcher</span>,
}));

describe("WorkspaceContext", () => {
  it("shows the active project and org labels", async () => {
    const { WorkspaceContext } = await import("./workspace-context");
    const ui = await WorkspaceContext();
    render(ui);
    expect(screen.getByText("Shop")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("Org switcher")).toBeInTheDocument();
    expect(screen.getByText("Project switcher")).toBeInTheDocument();
  });
});
