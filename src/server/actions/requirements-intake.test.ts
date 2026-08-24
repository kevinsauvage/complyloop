import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgMembership, Project } from "@/core/project-types";
import { emptyActionMessageState } from "../action-state";
import type { Db } from "../db";
import type { Workspace } from "../workspace";
import {
  applyFrameworkPresetAction,
  importChecklistAction,
  importCustomControlAction,
  updateRequirementScopeAction,
} from "./requirements-intake";

const withWorkspaceWrite = vi.hoisted(() => vi.fn());
const setProjectScope = vi.hoisted(() => vi.fn());
const importCustomControl = vi.hoisted(() => vi.fn());
const applyFrameworkPreset = vi.hoisted(() => vi.fn());
const importChecklist = vi.hoisted(() => vi.fn());
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
  setProjectScope: (...args: unknown[]) => setProjectScope(...args),
  importCustomControl: (...args: unknown[]) => importCustomControl(...args),
  applyFrameworkPreset: (...args: unknown[]) => applyFrameworkPreset(...args),
  importChecklist: (...args: unknown[]) => importChecklist(...args),
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
    controls: [{ id: "c1", frameworkId: "fw", code: "1", title: "T", description: "D", checkId: null, secondaryCode: "" }],
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

describe("updateRequirementScopeAction", () => {
  it("denies viewers", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspaceFor("viewer")));
    const form = new FormData();
    form.append("controlId", "c1");
    const result = await updateRequirementScopeAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Not allowed/);
  });

  it("saves selected scope for members", async () => {
    const workspace = workspaceFor("member");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    const form = new FormData();
    form.append("controlId", "c1");
    form.append("controlId", "c2");

    const result = await updateRequirementScopeAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toBe("Scope saved.");
    expect(setProjectScope).toHaveBeenCalledWith(workspace.db, project, [
      "c1",
      "c2",
    ]);
  });
});

describe("importCustomControlAction", () => {
  it("requires code, title, and description", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspaceFor("member")));
    const result = await importCustomControlAction(
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/Code, title, and description/);
  });

  it("imports a custom control with optional check id", async () => {
    const workspace = workspaceFor("member");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    const form = new FormData();
    form.set("code", "CUST-1");
    form.set("title", "Privacy");
    form.set("description", "Link present");
    form.set("secondaryCode", "Audit");
    form.set("checkId", "img-alt");

    const result = await importCustomControlAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toBe("Control imported.");
    expect(importCustomControl).toHaveBeenCalledWith(workspace.db, project, {
      code: "CUST-1",
      title: "Privacy",
      description: "Link present",
      secondaryCode: "Audit",
      checkId: "img-alt",
    });
  });
});

describe("applyFrameworkPresetAction", () => {
  it("requires a preset id", async () => {
    const result = await applyFrameworkPresetAction(
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/framework preset is required/);
  });

  it("applies a preset for members", async () => {
    const workspace = workspaceFor("member");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    applyFrameworkPreset.mockReturnValue({ added: 3 });
    const form = new FormData();
    form.set("presetId", "rgaa-core");

    const result = await applyFrameworkPresetAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toBe("Preset applied.");
    expect(applyFrameworkPreset).toHaveBeenCalledWith(
      workspace.db,
      project,
      "rgaa-core",
    );
  });

  it("reports when preset controls were already in scope", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) =>
      fn(workspaceFor("member")),
    );
    applyFrameworkPreset.mockReturnValue({ added: 0 });
    const form = new FormData();
    form.set("presetId", "rgaa-core");

    const result = await applyFrameworkPresetAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toBe(
      "Preset controls were already in scope — nothing changed.",
    );
  });
});

describe("importChecklistAction", () => {
  it("requires checklist text", async () => {
    const result = await importChecklistAction(
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/Paste a checklist/);
  });

  it("imports a pasted checklist", async () => {
    const workspace = workspaceFor("member");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    const form = new FormData();
    form.set("checklist", "CUST-1 | Title | Description");

    const result = await importChecklistAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toBe("Checklist imported.");
    expect(importChecklist).toHaveBeenCalledWith(
      workspace.db,
      project,
      "CUST-1 | Title | Description",
    );
  });
});
