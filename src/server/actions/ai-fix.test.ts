import "@/test-fixtures/register-action-workspace-mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionWorkspaceMocks, invokeProjectWriteMock } from "@/test-fixtures/action-workspace-mocks";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";
import { testWorkspace } from "@/test-fixtures/workspace";
import { emptyActionMessageState } from "../action-state";
import { generateAiFixAction } from "./ai-fix";

const { withProjectWrite, getWorkspace } = actionWorkspaceMocks;
const withProjectCheckout = vi.hoisted(() => vi.fn());
const runAiFixOnCheckout = vi.hoisted(() => vi.fn());
const persistPatchCandidate = vi.hoisted(() => vi.fn());
const assertAiRateLimit = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("../repo-checkout", () => ({
  withProjectCheckout: (...args: unknown[]) => withProjectCheckout(...args),
}));

vi.mock("../ai-fix", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai-fix")>();
  return {
    ...actual,
    runAiFixOnCheckout: (...args: unknown[]) => runAiFixOnCheckout(...args),
    persistPatchCandidate: (...args: unknown[]) =>
      persistPatchCandidate(...args),
  };
});

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

const project = testProject({
  orgId: "org-1",
  github: {
    fullName: "acme/shop",
    defaultBranch: "main",
    private: false,
  },
});

const finding = testFinding({
  location: {
    kind: "source",
    filePath: "Hero.tsx",
    line: 1,
    column: 1,
    snippet: "<img />",
    span: { start: 0, end: 1 },
  },
});

function workspace() {
  return testWorkspace({
    role: "member",
    project,
    findings: [finding],
    remediations: [
      testRemediation({ status: "detected", suggestion: null, history: [] }),
    ],
    db: {},
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("generateAiFixAction", () => {
  it("generates and persists a verified patch in the request", async () => {
    const current = workspace();
    getWorkspace.mockResolvedValue(current);
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(current, fn));
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
      expect.objectContaining({ id: "ctl-img-alt" }),
      expect.objectContaining({ aiAvailable: expect.any(Boolean) }),
    );
    expect(persistPatchCandidate).toHaveBeenCalledWith(
      current.db,
      finding,
      candidate,
      expect.any(Object),
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(current, fn));
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
