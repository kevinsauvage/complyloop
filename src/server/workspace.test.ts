import { beforeEach, describe, expect, it, vi } from "vitest";
import { testProject } from "@/test-fixtures/project";
import { testMembership } from "@/test-fixtures/membership";
import { emptyDb } from "@/server/db-store/types";

const auth = vi.hoisted(() => vi.fn());
const readActiveOrgCookie = vi.hoisted(() => vi.fn());
const readActiveProjectCookie = vi.hoisted(() => vi.fn());
const getDrizzle = vi.hoisted(() => vi.fn());
const loadWorkspaceDb = vi.hoisted(() => vi.fn());
const persistProjectSliceDiff = vi.hoisted(() => vi.fn());
const updateProject = vi.hoisted(() => vi.fn());

vi.mock("@/auth", () => ({ auth }));
vi.mock("./active-cookies", () => ({
  readActiveOrgCookie,
  readActiveProjectCookie,
}));
vi.mock("./db-store/client", () => ({ getDrizzle }));
vi.mock("./db-store/workspace-load", () => ({ loadWorkspaceDb }));
vi.mock("./db-store/repo/apply", async () => {
  const actual = await vi.importActual<typeof import("./db-store/repo/apply")>(
    "./db-store/repo/apply",
  );
  return {
    ...actual,
    persistProjectSliceDiff: (...args: unknown[]) =>
      persistProjectSliceDiff(...args),
  };
});
vi.mock("./db-store/repo/projects", () => ({ updateProject }));

import { withProjectWrite } from "./workspace";

describe("withProjectWrite", () => {
  const orgId = "org-1";
  const userId = "user-1";
  const project = testProject({ orgId, ownerUserId: userId });
  const tx = { kind: "tx" };

  beforeEach(() => {
    vi.clearAllMocks();
    getDrizzle.mockResolvedValue({
      transaction: async (fn: (innerTx: typeof tx) => Promise<unknown>) =>
        fn(tx),
    });
    auth.mockResolvedValue({ user: { id: userId, login: "dev" } });
    readActiveOrgCookie.mockResolvedValue(orgId);
    readActiveProjectCookie.mockResolvedValue(project.id);
    loadWorkspaceDb.mockResolvedValue({
      ...emptyDb(),
      organizations: [
        { id: orgId, name: "Acme", slug: "acme", createdAt: "2026-01-01" },
      ],
      memberships: [testMembership("owner", { userId, orgId })],
      projects: [structuredClone(project)],
    });
    persistProjectSliceDiff.mockResolvedValue(undefined);
    updateProject.mockResolvedValue(undefined);
  });

  it("persists active project row changes", async () => {
    await withProjectWrite(async (workspace) => {
      workspace.project!.runtimeBaseUrl = "https://preview.example";
      workspace.project!.runtimeRoutes = ["/"];
    });

    expect(updateProject).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        id: project.id,
        runtimeBaseUrl: "https://preview.example",
        runtimeRoutes: ["/"],
      }),
    );
  });

  it("skips project update when only runtime slice rows change", async () => {
    await withProjectWrite(async () => {
      /* no project mutation */
    });

    expect(updateProject).not.toHaveBeenCalled();
  });
});
