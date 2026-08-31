import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgMembership, Project } from "@/core/project-types";
import { emptyActionMessageState } from "../action-state";
import type { Db } from "../db";
import type { Workspace } from "../workspace";
import { applyFrameworkPresetAction } from "./requirements-intake";

const withWorkspaceWrite = vi.hoisted(() => vi.fn());
const applyFrameworkPreset = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  getGitHubAccessToken: vi.fn(),
  isGitHubAuthConfigured: () => false,
}));

vi.mock("../workspace", async () => {
  const actual = await vi.importActual<typeof import("../workspace")>(
    "../workspace",
  );
  return {
    ...actual,
    withWorkspaceWrite: (fn: (workspace: Workspace) => unknown) =>
      withWorkspaceWrite(fn),
  };
});

vi.mock("../requirements-intake", () => ({
  applyFrameworkPreset: (...args: unknown[]) => applyFrameworkPreset(...args),
}));

vi.mock("./shared", async () => {
  const actual = await vi.importActual<typeof import("./shared")>("./shared");
  return {
    ...actual,
    refresh: () => refresh(),
  };
});

const project: Project = {
  id: "p1",
  name: "Shop",
  source: "github",
  orgId: "org-1",
  ownerUserId: "owner-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function membership(role: OrgMembership["role"]): OrgMembership {
  return {
    id: "m1",
    orgId: "org-1",
    role,
    userId: "user-1",
    githubLogin: "alice",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function workspaceFor(role: OrgMembership["role"]): Workspace {
  const db = {
    frameworks: [],
    controls: [
      {
        id: "c1",
        frameworkId: "fw",
        code: "1",
        title: "T",
        description: "D",
        checkId: null,
        secondaryCode: "",
      },
    ],
    organizations: [{ id: "org-1", name: "Acme", slug: "acme", createdAt: "" }],
    memberships: [membership(role)],
    projects: [project],
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
    alerts: [],
  } as Db;

  return {
    db,
    project,
    userId: "user-1",
    githubLogin: "alice",
    access: {
      userId: "user-1",
      githubLogin: "alice",
      organizations: db.organizations,
      memberships: db.memberships,
    },
    visibleProjects: [project],
    organizations: db.organizations,
    activeOrgId: "org-1",
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("applyFrameworkPresetAction", () => {
  it("requires a preset id", async () => {
    const result = await applyFrameworkPresetAction(
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/framework preset is required/);
  });

  it("denies viewers", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) =>
      fn(workspaceFor("viewer")),
    );
    const form = new FormData();
    form.set("presetId", "preset-rgaa-aa");
    const result = await applyFrameworkPresetAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Not allowed/);
  });

  it("sets the assessment target for members", async () => {
    const workspace = workspaceFor("member");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    applyFrameworkPreset.mockReturnValue({ changed: true });
    const form = new FormData();
    form.set("presetId", "preset-rgaa-aa");

    const result = await applyFrameworkPresetAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toBe("Assessment target updated");
    expect(applyFrameworkPreset).toHaveBeenCalledWith(
      workspace.db,
      project,
      "preset-rgaa-aa",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reports when the target is already selected", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) =>
      fn(workspaceFor("member")),
    );
    applyFrameworkPreset.mockReturnValue({ changed: false });
    const form = new FormData();
    form.set("presetId", "preset-rgaa-aa");

    const result = await applyFrameworkPresetAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toBe("This is already the assessment target.");
  });
});
