import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const workspaceFixture: {
  organizations: Array<{
    id: string;
    name: string;
    slug: string;
    createdAt: string;
  }>;
  activeOrgId: string | null;
} = {
  organizations: [
    { id: "org-1", name: "Acme", slug: "acme", createdAt: "" },
    { id: "org-2", name: "Beta", slug: "beta", createdAt: "" },
  ],
  activeOrgId: "org-1",
};

vi.mock("@/server/workspace/workspace", () => ({
  getWorkspace: vi.fn(async () => workspaceFixture),
}));

vi.mock("./org-switcher", () => ({
  OrgSwitcher: () => <span>Org switcher</span>,
}));

afterEach(() => {
  cleanup();
});

describe("WorkspaceSwitcher", () => {
  it("offers the org switch to multi-org viewers", async () => {
    const { WorkspaceSwitcher } = await import("./workspace-context");
    render(await WorkspaceSwitcher());

    expect(screen.getByText("Org switcher")).toBeInTheDocument();
  });

  it("shows a read-only label for a single organization", async () => {
    const all = workspaceFixture.organizations;
    workspaceFixture.organizations = all.slice(0, 1);
    try {
      const { WorkspaceSwitcher } = await import("./workspace-context");
      render(await WorkspaceSwitcher());

      expect(screen.getByText("Acme")).toBeInTheDocument();
      expect(screen.queryByText("Org switcher")).toBeNull();
      expect(screen.queryByRole("combobox")).toBeNull();
    } finally {
      workspaceFixture.organizations = all;
    }
  });
});
