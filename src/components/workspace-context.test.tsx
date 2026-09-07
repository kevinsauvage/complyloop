import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const workspaceFixture = {
  project: {
    id: "p1",
    name: "Shop",
    orgId: "org-1",
    source: "github",
    createdAt: "",
  },
  projects: [
    {
      id: "p1",
      name: "Shop",
      orgId: "org-1",
      source: "github",
      createdAt: "",
    },
  ],
  visibleProjects: [
    {
      id: "p1",
      name: "Shop",
      orgId: "org-1",
      source: "github",
      createdAt: "",
    },
    {
      id: "p2",
      name: "Docs",
      orgId: "org-1",
      source: "github",
      createdAt: "",
    },
  ],
  organizations: [
    { id: "org-1", name: "Acme", slug: "acme", createdAt: "" },
    { id: "org-2", name: "Beta", slug: "beta", createdAt: "" },
  ],
  activeOrgId: "org-1",
  access: { userId: "u1", githubLogin: "u1", memberships: [], organizations: [] },
};

vi.mock("@/server/workspace", () => ({
  getWorkspace: vi.fn(async () => workspaceFixture),
}));

vi.mock("@complyloop/db/client", () => ({
  getDrizzle: vi.fn(),
}));

vi.mock("@complyloop/db/repo/assessments", () => ({
  listLatestAssessmentForProject: vi.fn(async () => []),
}));

vi.mock("@/server/project-capabilities", () => ({
  projectCapabilities: () => ({
    canView: true,
    canAssess: true,
    canRemediate: true,
    canConnect: true,
  }),
}));

vi.mock("@/components/org-switcher", () => ({
  OrgSwitcher: () => <span>Org switcher</span>,
}));

vi.mock("@/components/project-switcher", () => ({
  ProjectSwitcher: () => <span>Project switcher</span>,
}));

vi.mock("@/components/connect-project-panel", () => ({
  ConnectProjectPanel: () => <button type="button">Add project</button>,
}));

describe("WorkspaceContext", () => {
  it("shows org and project switchers when multiple options exist", async () => {
    const { WorkspaceContext } = await import("./workspace-context");
    const ui = await WorkspaceContext();
    render(ui);
    expect(screen.getByText("Org switcher")).toBeInTheDocument();
    expect(screen.getByText("Project switcher")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add project" }),
    ).toBeInTheDocument();
  });
});
