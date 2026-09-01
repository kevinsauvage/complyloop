import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrgMembership } from "@/core/project-types";
import { testProject } from "@/test-fixtures/project";
import { PublicError } from "@/core/public-error";
import { emptyActionMessageState } from "../action-state";
import type { Db } from "../db";
import type { Workspace } from "../workspace";
import { updateRuntimeAuditAction } from "./runtime-audit";

const withWorkspaceWrite = vi.hoisted(() => vi.fn());
const assertSafeRuntimeUrl = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  getGitHubAccessToken: vi.fn(),
  isGitHubAuthConfigured: () => false,
}));

vi.mock("@/analysis/runtime/url-safety", () => ({
  assertSafeRuntimeUrl: (...args: unknown[]) => assertSafeRuntimeUrl(...args),
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

vi.mock("./shared", async () => {
  const actual = await vi.importActual<typeof import("./shared")>("./shared");
  return {
    ...actual,
    refresh: () => refresh(),
  };
});

const project = testProject({
  orgId: "org-1",
  runtimeBaseUrl: "https://old.example",
  runtimeRoutes: ["/old"],
});

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
  const liveProject = { ...project };
  const db = {
    frameworks: [],
    controls: [],
    organizations: [{ id: "org-1", name: "Acme", slug: "acme", createdAt: "" }],
    memberships: [membership(role)],
    projects: [liveProject],
    requirements: [],
    assessments: [],
    findings: [],
    remediations: [],
    evidence: [],
    alerts: [],
  } as Db;

  return {
    db,
    project: liveProject,
    userId: "user-1",
    githubLogin: "alice",
    access: {
      userId: "user-1",
      githubLogin: "alice",
      organizations: db.organizations,
      memberships: db.memberships,
    },
    visibleProjects: [liveProject],
    organizations: db.organizations,
    activeOrgId: "org-1",
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("updateRuntimeAuditAction", () => {
  it("denies members who cannot connect", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspaceFor("member")));
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/");
    const form = new FormData();
    form.set("runtimeBaseUrl", "https://app.example");

    const result = await updateRuntimeAuditAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Not allowed/);
  });

  it("clears runtime settings when the base URL is empty", async () => {
    const workspace = workspaceFor("owner");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    const form = new FormData();
    form.set("runtimeBaseUrl", "  ");

    const result = await updateRuntimeAuditAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toMatch(/Runtime audit settings saved/);
    expect(workspace.project?.runtimeBaseUrl).toBeUndefined();
    expect(workspace.project?.runtimeRoutes).toBeUndefined();
    expect(assertSafeRuntimeUrl).not.toHaveBeenCalled();
  });

  it("normalizes the origin and routes for owners", async () => {
    const workspace = workspaceFor("owner");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    assertSafeRuntimeUrl.mockResolvedValue("https://app.example/path");
    const form = new FormData();
    form.set("runtimeBaseUrl", "https://app.example/path");
    form.set("runtimeRoutes", "home, /about\ncontact");

    const result = await updateRuntimeAuditAction(
      emptyActionMessageState,
      form,
    );

    expect(result.message).toMatch(/Runtime audit settings saved/);
    expect(workspace.project?.runtimeBaseUrl).toBe("https://app.example");
    expect(workspace.project?.runtimeRoutes).toEqual([
      "/home",
      "/about",
      "/contact",
    ]);
  });

  it("surfaces unsafe URL errors", async () => {
    assertSafeRuntimeUrl.mockRejectedValue(
      new PublicError("URL is not allowed for runtime audit."),
    );
    const form = new FormData();
    form.set("runtimeBaseUrl", "http://127.0.0.1");

    const result = await updateRuntimeAuditAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/not allowed for runtime audit/);
    expect(withWorkspaceWrite).not.toHaveBeenCalled();
  });
});
