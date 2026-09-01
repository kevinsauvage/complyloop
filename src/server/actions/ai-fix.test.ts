import { afterEach, describe, expect, it, vi } from "vitest";
import type { Control, OrgMembership, Project } from "@/core/project-types";
import type { Finding, Remediation } from "@/core/finding-types";
import { emptyActionMessageState } from "../action-state";
import type { Db } from "../db";
import type { Workspace } from "../workspace";
import { generateAiFixAction } from "./ai-fix";

const withWorkspaceWrite = vi.hoisted(() => vi.fn());
const getWorkspace = vi.hoisted(() => vi.fn());
const withProjectCheckout = vi.hoisted(() => vi.fn());
const runAiFixOnCheckout = vi.hoisted(() => vi.fn());
const persistPatchCandidate = vi.hoisted(() => vi.fn());
const assertAiRateLimit = vi.hoisted(() => vi.fn());
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
    getWorkspace: () => getWorkspace(),
    withWorkspaceWrite: (fn: (workspace: Workspace) => unknown) =>
      withWorkspaceWrite(fn),
  };
});

vi.mock("../repo-checkout", () => ({
  withProjectCheckout: (...args: unknown[]) => withProjectCheckout(...args),
}));

vi.mock("../ai-fix-run", async () => {
  const actual = await vi.importActual<typeof import("../ai-fix-run")>(
    "../ai-fix-run",
  );
  return {
    ...actual,
    runAiFixOnCheckout: (...args: unknown[]) => runAiFixOnCheckout(...args),
  };
});

vi.mock("../ai-fix-persist", () => ({
  persistPatchCandidate: (...args: unknown[]) =>
    persistPatchCandidate(...args),
}));

vi.mock("../rate-limit", () => ({
  assertAiRateLimit: (...args: unknown[]) => assertAiRateLimit(...args),
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
  github: {
    fullName: "acme/shop",
    defaultBranch: "main",
    private: false,
  },
};

const control: Control = {
  id: "c1",
  frameworkId: "fw",
  code: "WCAG 1.1.1",
  secondaryCode: "RGAA 1.1",
  title: "Images",
  description: "Alt",
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
    filePath: "Hero.tsx",
    line: 1,
    column: 1,
    snippet: "<img />",
    span: { start: 0, end: 1 },
  },
  fix: null,
  explanations: [],
  detectedAt: "2026-01-01T00:00:00.000Z",
};

function workspace(): Workspace {
  const db = {
    frameworks: [],
    controls: [control],
    organizations: [{ id: "org-1", name: "Acme", slug: "acme", createdAt: "" }],
    memberships: [
      {
        id: "m1",
        orgId: "org-1",
        role: "member",
        userId: "user-1",
        githubLogin: "alice",
        createdAt: "",
      } satisfies OrgMembership,
    ],
    projects: [project],
    requirements: [],
    assessments: [],
    findings: [finding],
    remediations: [
      {
        id: "r1",
        findingId: "f1",
        status: "detected",
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

describe("generateAiFixAction", () => {
  it("generates and persists a verified patch in the request", async () => {
    const current = workspace();
    getWorkspace.mockResolvedValue(current);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(current));
    withProjectCheckout.mockImplementation(
      async (_project, fn: (rootPath: string) => unknown) =>
        fn("/tmp/checkout"),
    );
    const candidate = {
      description: "Add alt",
      provenance: "ai",
      edits: [
        {
          path: "Hero.tsx",
          oldText: "<img />",
          newText: '<img alt="Hero" />',
        },
      ],
      complyLoop: { passed: true, remaining: [] },
    };
    runAiFixOnCheckout.mockResolvedValue(candidate);
    assertAiRateLimit.mockResolvedValue(undefined);

    const result = await generateAiFixAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.error).toBeNull();
    expect(result.message).toMatch(/ready for review/i);
    expect(runAiFixOnCheckout).toHaveBeenCalledWith(
      "/tmp/checkout",
      finding,
      control,
    );
    expect(persistPatchCandidate).toHaveBeenCalledWith(
      current.db,
      finding,
      candidate,
    );
    expect(assertAiRateLimit).toHaveBeenCalledWith("user-1");
    expect(refresh).toHaveBeenCalled();
  });

  it("rejects DOM findings", async () => {
    const current = workspace();
    current.db.findings[0] = {
      ...finding,
      location: {
        kind: "dom",
        url: "https://preview.example.com/",
        selector: "img",
        snippet: "<img>",
      },
    };
    getWorkspace.mockResolvedValue(current);

    const result = await generateAiFixAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/source findings/);
    expect(withProjectCheckout).not.toHaveBeenCalled();
  });

  it("does not consume the AI rate limit for a safe deterministic fix", async () => {
    const current = workspace();
    current.db.findings[0] = {
      ...finding,
      fix: {
        kind: "remove_attribute",
        attribute: "autoFocus",
        span: { start: 4, end: 14 },
      },
    };
    getWorkspace.mockResolvedValue(current);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(current));
    withProjectCheckout.mockImplementation(
      async (_project, fn: (rootPath: string) => unknown) =>
        fn("/tmp/checkout"),
    );
    runAiFixOnCheckout.mockResolvedValue({
      description: "Remove autoFocus",
      provenance: "deterministic",
      edits: [{ path: "Hero.tsx", oldText: " autoFocus", newText: "" }],
      complyLoop: { passed: true, remaining: [] },
    });

    const result = await generateAiFixAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.error).toBeNull();
    expect(assertAiRateLimit).not.toHaveBeenCalled();
  });

  it("rejects when the project has no GitHub repo", async () => {
    const current = workspace();
    current.db.projects[0] = { ...project, github: undefined };
    getWorkspace.mockResolvedValue(current);

    const result = await generateAiFixAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/GitHub repository/);
    expect(withProjectCheckout).not.toHaveBeenCalled();
  });
});
