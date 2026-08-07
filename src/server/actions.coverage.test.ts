import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Control,
  Finding,
  OrgMembership,
  Project,
  Remediation,
  Requirement,
} from "@/core/types";
import { emptyActionMessageState } from "./action-state";
import type { Db } from "./db";
import type { Workspace } from "./workspace";

const withWorkspaceWrite = vi.hoisted(() => vi.fn());
const locateViolationInProject = vi.hoisted(() => vi.fn());
const refreshRequirementStatuses = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  getGitHubAccessToken: vi.fn(),
  isGitHubAuthConfigured: () => false,
}));

vi.mock("./workspace", async () => {
  const actual = await vi.importActual<typeof import("./workspace")>("./workspace");
  return {
    ...actual,
    withWorkspaceWrite: (fn: (workspace: Workspace) => unknown) =>
      withWorkspaceWrite(fn),
  };
});

vi.mock("./observability", () => ({
  reportError: vi.fn(),
  reportWarning: vi.fn(),
}));

vi.mock("./assessment-helpers", () => ({
  buildSuggestion: vi.fn(() => null),
  locateViolationInProject: (...args: unknown[]) =>
    locateViolationInProject(...args),
  mergeFix: vi.fn((existing, fresh) => fresh ?? existing),
}));

vi.mock("./assessment-status", () => ({
  refreshRequirementStatuses: (...args: unknown[]) =>
    refreshRequirementStatuses(...args),
}));

import { verifyRemediationAction } from "./actions/remediation";
import { markRemediationImplementedAction } from "./actions/remediation";
import { dismissFindingAction } from "./actions/remediation-dismiss";
import {
  clearRequirementExceptionAction,
  markRequirementExceptionAction,
  markRequirementPassedAction,
} from "./actions/requirements";

const project: Project = {
  id: "p1",
  name: "Shop",
  rootPath: "/tmp/shop",
  source: "github",
  orgId: "org-1",
  ownerUserId: "owner-1",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const control: Control = {
  id: "c1",
  frameworkId: "fw",
  code: "1.1.1",
  secondaryCode: "WCAG",
  title: "Images",
  description: "Alt text",
  checkId: "img-alt",
};

const manualControl: Control = {
  ...control,
  id: "c-manual",
  code: "CUST-1",
  checkId: null,
};

const finding: Finding = {
  id: "f1",
  projectId: "p1",
  controlId: "c1",
  assessmentId: "a1",
  checkId: "img-alt",
  kind: "violation",
  status: "open",
  severity: "serious",
  confidence: "high",
  reason: "Missing alt",
  location: {
    filePath: "App.tsx",
    line: 1,
    column: 1,
    snippet: '<img src="x" />',
    span: { start: 0, end: 16 },
  },
  fix: null,
  explanations: [],
  detectedAt: "2026-01-01T00:00:00.000Z",
};

function membership(role: OrgMembership["role"], userId: string): OrgMembership {
  return {
    id: `m-${userId}`,
    orgId: "org-1",
    role,
    userId,
    githubLogin: userId,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function baseWorkspace(overrides: Partial<Db> = {}): Workspace {
  const userId = "user-1";
  const db = {
    frameworks: [],
    controls: [control, manualControl],
    organizations: [{ id: "org-1", name: "Acme", slug: "acme", createdAt: "" }],
    memberships: [membership("member", userId)],
    projects: [project],
    activeProjectId: project.id,
    requirements: [] as Requirement[],
    assessments: [],
    findings: [{ ...finding }],
    remediations: [
      {
        id: "r1",
        findingId: "f1",
        status: "implemented",
        suggestion: null,
        history: [],
      } satisfies Remediation,
    ],
    evidence: [],
    alerts: [],
    ...overrides,
  } as Db;

  return {
    db,
    project,
    userId,
    githubLogin: userId,
    access: {
      userId,
      githubLogin: userId,
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

describe("verifyRemediationAction", () => {
  it("reports still-failing when the violation is still located", async () => {
    const workspace = baseWorkspace();
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    locateViolationInProject.mockReturnValue({
      checkId: "img-alt",
      kind: "violation",
      severity: "serious",
      confidence: "high",
      reason: "still missing",
      location: finding.location,
      fix: null,
    });

    const result = await verifyRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.error).toMatch(/still failing|still detected/i);
    expect(workspace.db.remediations[0]?.status).toBe("implemented");
  });

  it("marks verified when the violation is gone", async () => {
    const workspace = baseWorkspace();
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    locateViolationInProject.mockReturnValue(undefined);

    const result = await verifyRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result).toEqual({
      error: null,
      message: "Fix verified by automated re-check.",
    });
    expect(workspace.db.remediations[0]?.status).toBe("verified");
    expect(workspace.db.findings[0]?.status).toBe("resolved");
    expect(refreshRequirementStatuses).toHaveBeenCalled();
  });
});

describe("markRemediationImplementedAction", () => {
  it("advances an approved remediation to implemented", async () => {
    const workspace = baseWorkspace({
      remediations: [
        {
          id: "r1",
          findingId: "f1",
          status: "approved",
          suggestion: null,
          history: [],
        },
      ],
    });
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    const form = new FormData();
    form.set("note", "Fixed in PR #9");

    const result = await markRemediationImplementedAction(
      "f1",
      emptyActionMessageState,
      form,
    );

    expect(result.message).toMatch(/implemented/i);
    expect(workspace.db.remediations[0]?.status).toBe("implemented");
  });
});

describe("dismissFindingAction", () => {
  it("dismisses with a documented reason", async () => {
    const workspace = baseWorkspace({
      remediations: [
        {
          id: "r1",
          findingId: "f1",
          status: "suggested",
          suggestion: null,
          history: [],
        },
      ],
    });
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    const form = new FormData();
    form.set("reason", "false_positive");
    form.set("note", "decorative");

    const result = await dismissFindingAction(
      "f1",
      emptyActionMessageState,
      form,
    );

    expect(result.message).toMatch(/dismissed/i);
    expect(workspace.db.findings[0]?.status).toBe("dismissed");
    expect(refreshRequirementStatuses).toHaveBeenCalled();
  });

  it("requires a valid dismissal reason", async () => {
    const workspace = baseWorkspace();
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    const result = await dismissFindingAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/dismissal reason/i);
  });
});

describe("requirement decision actions", () => {
  function requirementWorkspace(
    requirement: Requirement,
    controls: Control[] = [control, manualControl],
  ): Workspace {
    return baseWorkspace({
      controls,
      requirements: [requirement],
      findings: [],
      remediations: [],
    });
  }

  it("records a not-applicable exception", async () => {
    const requirement: Requirement = {
      id: "req-1",
      projectId: "p1",
      controlId: "c1",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));

    const form = new FormData();
    form.set("reason", "not_applicable");
    form.set("note", "Out of scope for this surface");

    const result = await markRequirementExceptionAction(
      "req-1",
      emptyActionMessageState,
      form,
    );

    expect(result.message).toMatch(/Exception recorded/);
    expect(workspace.db.requirements[0]?.status).toBe("not_applicable");
    expect(workspace.db.requirements[0]?.exception?.reason).toBe(
      "not_applicable",
    );
  });

  it("marks a manual control as human-passed", async () => {
    const requirement: Requirement = {
      id: "req-2",
      projectId: "p1",
      controlId: "c-manual",
      status: "unable_to_verify",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));

    const form = new FormData();
    form.set("note", "Reviewed in staging");

    const result = await markRequirementPassedAction(
      "req-2",
      emptyActionMessageState,
      form,
    );

    expect(result.message).toMatch(/Human pass/);
    expect(workspace.db.requirements[0]?.status).toBe("passed");
    expect(workspace.db.requirements[0]?.humanPass?.note).toMatch(/staging/);
  });

  it("clears an exception and refreshes status", async () => {
    const requirement: Requirement = {
      id: "req-3",
      projectId: "p1",
      controlId: "c1",
      status: "not_applicable",
      determination: "human_review",
      updatedAt: "2026-01-01T00:00:00.000Z",
      exception: {
        reason: "not_applicable",
        note: "temp",
        at: "2026-01-01T00:00:00.000Z",
      },
    };
    const workspace = requirementWorkspace(requirement);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));

    const result = await clearRequirementExceptionAction(
      "req-3",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.message).toMatch(/Exception cleared/);
    expect(workspace.db.requirements[0]?.exception).toBeUndefined();
    expect(refreshRequirementStatuses).toHaveBeenCalledWith(
      workspace.db,
      "p1",
    );
  });
});
