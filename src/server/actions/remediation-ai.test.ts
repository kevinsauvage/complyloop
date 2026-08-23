import { afterEach, describe, expect, it, vi } from "vitest";
import type { Control, OrgMembership, Project } from "@/core/project-types";
import type { Finding, Remediation } from "@/core/finding-types";
import { emptyActionMessageState } from "../action-state";
import type { Db } from "../db";
import type { Workspace } from "../workspace";
import {
  generateAiExplanationAction,
  generateAiRemediationAction,
} from "./remediation-ai";

const withWorkspaceWrite = vi.hoisted(() => vi.fn());
const generateAiExplanation = vi.hoisted(() => vi.fn());
const generateAiRemediation = vi.hoisted(() => vi.fn());
const assertAiRateLimit = vi.hoisted(() => vi.fn());
const reportWarning = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
  getGitHubAccessToken: vi.fn(),
  isGitHubAuthConfigured: () => false,
}));

vi.mock("@/ai/explainer", () => ({
  generateAiExplanation: (...args: unknown[]) => generateAiExplanation(...args),
  aiExplanationAvailable: () => true,
}));

vi.mock("@/ai/remediation", () => ({
  generateAiRemediation: (...args: unknown[]) => generateAiRemediation(...args),
}));

vi.mock("@/ai/warn", () => ({
  setAiWarn: vi.fn(),
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

vi.mock("../rate-limit", () => ({
  assertAiRateLimit: (...args: unknown[]) => assertAiRateLimit(...args),
}));

vi.mock("../observability", () => ({
  reportError: vi.fn(),
  reportWarning: (...args: unknown[]) => reportWarning(...args),
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

const control: Control = {
  id: "c1",
  frameworkId: "fw",
  code: "1.1.1",
  secondaryCode: "WCAG",
  title: "Images",
  description: "Alt text",
  checkId: "img-alt",
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
    kind: "source",
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

function workspaceFor(
  role: OrgMembership["role"],
  remediationStatus: Remediation["status"] = "detected",
): Workspace {
  const db = {
    frameworks: [],
    controls: [control],
    organizations: [{ id: "org-1", name: "Acme", slug: "acme", createdAt: "" }],
    memberships: [membership(role)],
    projects: [project],
    requirements: [],
    assessments: [],
    findings: [{ ...finding, explanations: [], fix: finding.fix }],
    remediations: [
      {
        id: "r1",
        findingId: "f1",
        status: remediationStatus,
        suggestion: null,
        history: [],
      } satisfies Remediation,
    ],
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

describe("generateAiExplanationAction", () => {
  it("denies when the caller cannot view the project", async () => {
    const workspace = workspaceFor("viewer");
    workspace.access.memberships = [];
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    assertAiRateLimit.mockResolvedValue(undefined);

    const result = await generateAiExplanationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/Not allowed/);
  });

  it("adds an explanation when the model returns one", async () => {
    const workspace = workspaceFor("member");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    assertAiRateLimit.mockResolvedValue(undefined);
    generateAiExplanation.mockResolvedValue({
      whyItFailed: "Missing alt attribute",
      impact: "Screen readers cannot describe the image.",
      howToFix: "Add a meaningful alt attribute.",
      provenance: "ai",
      model: "test-model",
      confidence: "medium",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await generateAiExplanationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.message).toBe("AI explanation added.");
    expect(workspace.db.findings[0]?.explanations).toHaveLength(1);
  });

  it("errors when AI explanation is unavailable", async () => {
    const workspace = workspaceFor("member");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    assertAiRateLimit.mockResolvedValue(undefined);
    generateAiExplanation.mockResolvedValue(null);

    const result = await generateAiExplanationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.error).toMatch(/AI explanation unavailable/);
    expect(reportWarning).toHaveBeenCalled();
  });
});

describe("generateAiRemediationAction", () => {
  it("rejects non-open findings", async () => {
    const workspace = workspaceFor("member");
    const openFinding = workspace.db.findings[0];
    if (!openFinding) throw new Error("expected finding");
    openFinding.status = "resolved";
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    assertAiRateLimit.mockResolvedValue(undefined);

    const result = await generateAiRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/only available for open findings/);
  });

  it("rejects remediations past the suggestion stage", async () => {
    const workspace = workspaceFor("member", "approved");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    assertAiRateLimit.mockResolvedValue(undefined);

    const result = await generateAiRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/before approval/);
  });

  it("advances detected remediations to suggested", async () => {
    const workspace = workspaceFor("member", "detected");
    const openFinding = workspace.db.findings[0];
    if (!openFinding) throw new Error("expected finding");
    openFinding.fix = {
      kind: "insert_attribute",
      attribute: "alt",
      value: "",
      editable: true,
      span: { start: 0, end: 16 },
    };
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    assertAiRateLimit.mockResolvedValue(undefined);
    generateAiRemediation.mockResolvedValue({
      suggestion: {
        description: "Describe the image",
        proposedSnippet: "Cart icon",
        provenance: "ai",
        model: "test-model",
        confidence: "high",
      },
      attributeValue: "Cart icon",
    });

    const result = await generateAiRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.message).toBe("AI remediation suggestion saved.");
    expect(workspace.db.remediations[0]?.status).toBe("suggested");
    expect(openFinding.fix).toMatchObject({ value: "Cart icon" });
    expect(
      workspace.db.evidence.some((row) => row.kind === "ai_remediation_suggested"),
    ).toBe(true);
  });

  it("refreshes an existing suggested remediation", async () => {
    const workspace = workspaceFor("member", "suggested");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    assertAiRateLimit.mockResolvedValue(undefined);
    generateAiRemediation.mockResolvedValue({
      suggestion: {
        description: "Refined alt",
        proposedSnippet: "Logo",
        provenance: "ai",
        model: "test-model",
        confidence: "medium",
      },
    });

    const result = await generateAiRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.message).toBe("AI remediation suggestion saved.");
    expect(workspace.db.remediations[0]?.status).toBe("suggested");
    expect(workspace.db.remediations[0]?.history.at(-1)?.note).toMatch(
      /AI suggestion refreshed/,
    );
  });

  it("errors when AI remediation is unavailable", async () => {
    const workspace = workspaceFor("member", "detected");
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    assertAiRateLimit.mockResolvedValue(undefined);
    generateAiRemediation.mockResolvedValue(null);

    const result = await generateAiRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/AI remediation unavailable/);
  });
});
