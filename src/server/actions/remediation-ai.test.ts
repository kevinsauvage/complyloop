import "@/test-fixtures/register-action-workspace-mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Remediation } from "@complyloop/analysis-core/contract/finding-types";
import type { OrgMembership } from "@complyloop/domain/project-types";
import { actionWorkspaceMocks, invokeProjectWriteMock } from "@/test-fixtures/action-workspace-mocks";
import { testControl } from "@/test-fixtures/control";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";
import { testWorkspace } from "@/test-fixtures/workspace";
import { emptyActionMessageState } from "../action-state";
import {
  generateAiExplanationAction,
  generateAiRemediationAction,
} from "./remediation-ai";

const { withProjectWrite } = actionWorkspaceMocks;
const generateAiExplanation = vi.hoisted(() => vi.fn());
const generateAiRemediation = vi.hoisted(() => vi.fn());
const assertAiRateLimit = vi.hoisted(() => vi.fn());
const reportWarning = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

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

const project = testProject({ orgId: "org-1" });
const control = testControl();
const finding = testFinding();

function workspaceFor(
  role: OrgMembership["role"],
  remediationStatus: Remediation["status"] = "detected",
) {
  return testWorkspace({
    role,
    project,
    findings: [{ ...finding, explanations: [], fix: finding.fix }],
    remediations: [
      testRemediation({
        status: remediationStatus,
        suggestion: null,
        history: [],
      }),
    ],
    db: { controls: [control] },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("generateAiExplanationAction", () => {
  it("denies when the caller cannot view the project", async () => {
    const workspace = workspaceFor("viewer");
    workspace.access.memberships = [];
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
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
