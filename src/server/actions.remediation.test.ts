import { afterEach, describe, expect, it, vi } from "vitest";
import type { Finding, OrgMembership, Project, Remediation } from "@/core/types";
import { emptyActionMessageState } from "./action-state";
import type { Db } from "./db";
import type { Workspace } from "./workspace";

const withWorkspaceWrite = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  getGitHubAccessToken: vi.fn(),
  isGitHubAuthConfigured: () => false,
}));

vi.mock("@/ai/explainer", () => ({
  generateAiExplanation: vi.fn(),
  aiExplanationAvailable: () => false,
}));

vi.mock("@/ai/remediation", () => ({
  generateAiRemediation: vi.fn(),
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

vi.mock("./assessment", () => ({
  runAssessment: vi.fn(),
}));

vi.mock("./assessment-helpers", () => ({
  buildSuggestion: vi.fn(),
  locateViolationInProject: vi.fn(),
  mergeFix: vi.fn(),
}));

vi.mock("./assessment-status", () => ({
  refreshRequirementStatuses: vi.fn(),
}));

import { runAssessmentAction } from "./actions/assessment";
import { dismissFindingAction } from "./actions/remediation-dismiss";
import { approveRemediationAction } from "./actions/remediation";

const project: Project = {
  id: "p1",
  name: "Shop",
  rootPath: "/tmp/shop",
  source: "github",
  orgId: "org-1",
  ownerUserId: "owner-1",
  createdAt: "2026-01-01T00:00:00.000Z",
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
    snippet: "<img src=\"x\" />",
    span: { start: 0, end: 16 },
  },
  fix: null,
  explanations: [],
  detectedAt: "2026-01-01T00:00:00.000Z",
};

const remediation: Remediation = {
  id: "r1",
  findingId: "f1",
  status: "suggested",
  suggestion: {
    description: "Add alt",
    proposedSnippet: '<img src="x" alt="" />',
    provenance: "deterministic",
  },
  history: [],
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

function workspaceFor(role: OrgMembership["role"]): Workspace {
  const userId = "user-1";
  const db = {
    frameworks: [],
    controls: [],
    organizations: [{ id: "org-1", name: "Acme", slug: "acme", createdAt: "" }],
    memberships: [membership(role, userId)],
    projects: [project],
    activeProjectId: project.id,
    requirements: [],
    assessments: [],
    findings: [{ ...finding }],
    remediations: [{ ...remediation, history: [] }],
    evidence: [],
    alerts: [],
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

describe("remediation action authz", () => {
  it("denies approve for viewers", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspaceFor("viewer")));
    const result = await approveRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/Not allowed/);
    expect(result.message).toBeNull();
  });

  it("approves for members", async () => {
    const workspace = workspaceFor("member");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    const result = await approveRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result).toEqual({
      error: null,
      message: "Remediation approved.",
    });
    expect(workspace.db.remediations[0]?.status).toBe("approved");
  });

  it("denies dismiss for viewers", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspaceFor("viewer")));
    const formData = new FormData();
    formData.set("reason", "false_positive");
    formData.set("note", "not a real issue");
    const result = await dismissFindingAction(
      "f1",
      emptyActionMessageState,
      formData,
    );
    expect(result.error).toMatch(/Not allowed/);
  });

  it("denies run assessment for viewers", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspaceFor("viewer")));
    const result = await runAssessmentAction(
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/Not allowed/);
  });
});
