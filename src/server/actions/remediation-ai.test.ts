import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Remediation } from "@complyloop/analysis-core/contract/entities";
import type { OrgMembership } from "@complyloop/analysis-core/contract/project-types";

import { initialActionState } from "@/core/action-state";
import {
  actionWorkspaceMocks,
  clearProjectWritePayloads,
  mockProjectWrite,
  projectWritePayload,
} from "@/test-fixtures/action-workspace-mocks";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";
import { testWorkspace } from "@/test-fixtures/workspace";

import {
  generateAiExplanationAction,
  generateAiRemediationAction,
} from "./remediation-ai";

const generateAiExplanation = vi.hoisted(() => vi.fn());
const generateAiRemediation = vi.hoisted(() => vi.fn());
const assertAiRateLimit = vi.hoisted(() => vi.fn());
const reportWarning = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/ai/explainer", () => ({
  generateAiExplanation: (...args: unknown[]) => generateAiExplanation(...args),
}));

vi.mock("@/ai/remediation", () => ({
  generateAiRemediation: (...args: unknown[]) => generateAiRemediation(...args),
}));

vi.mock("../rate-limit", () => ({
  assertAiRateLimit: (...args: unknown[]) => assertAiRateLimit(...args),
}));

vi.mock("../observability", () => ({
  reportError: vi.fn(),
  reportWarning: (...args: unknown[]) => reportWarning(...args),
  reportAppError: vi.fn(),
}));

vi.mock("./shared", async () => {
  const actual = await vi.importActual<typeof import("./shared")>("./shared");
  return {
    ...actual,
    refresh: () => refresh(),
  };
});

const project = testProject({ orgId: "org-1" });
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
    db: {},
  });
}

afterEach(() => {
  clearProjectWritePayloads();
  vi.clearAllMocks();
});

describe("generateAiExplanationAction", () => {
  it("denies when the caller cannot view the project", async () => {
    const workspace = workspaceFor("viewer");
    workspace.access.memberships = [];
    mockProjectWrite(workspace);
    actionWorkspaceMocks.getWorkspace.mockResolvedValue(workspace);
    assertAiRateLimit.mockResolvedValue(undefined);

    const result = await generateAiExplanationAction(
      "f1",
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(/Not allowed/);
    // Denied in the preview: no AI call, no write.
    expect(generateAiExplanation).not.toHaveBeenCalled();
    expect(actionWorkspaceMocks.withProjectWrite).not.toHaveBeenCalled();
  });

  it("denies viewers with membership: explaining writes the finding row", async () => {
    const workspace = workspaceFor("viewer");
    mockProjectWrite(workspace);
    actionWorkspaceMocks.getWorkspace.mockResolvedValue(workspace);
    assertAiRateLimit.mockResolvedValue(undefined);

    const result = await generateAiExplanationAction(
      "f1",
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(/Not allowed/);
    expect(generateAiExplanation).not.toHaveBeenCalled();
    expect(actionWorkspaceMocks.withProjectWrite).not.toHaveBeenCalled();
  });

  it("adds an explanation when the model returns one", async () => {
    const workspace = workspaceFor("member");
    mockProjectWrite(workspace);
    actionWorkspaceMocks.getWorkspace.mockResolvedValue(workspace);
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
      initialActionState,
      new FormData(),
    );

    expect(result.message).toBe("AI explanation added.");
    expect(projectWritePayload()?.findings?.[0]?.explanations).toHaveLength(1);
  });

  it("caps explanations at baseline plus latest AI additions", async () => {
    const baseline = {
      whyItFailed: "base",
      impact: "base",
      howToFix: "base",
      provenance: "deterministic" as const,
      generatedAt: "2026-01-01T00:00:00.000Z",
    };
    const olds = Array.from({ length: 6 }, (_, index) => ({
      ...baseline,
      provenance: "ai" as const,
      whyItFailed: `old-${index}`,
    }));
    const workspace = testWorkspace({
      role: "member",
      project,
      findings: [
        { ...finding, explanations: [baseline, ...olds], fix: finding.fix },
      ],
      remediations: [
        testRemediation({ status: "detected", suggestion: null, history: [] }),
      ],
      db: {},
    });
    mockProjectWrite(workspace);
    actionWorkspaceMocks.getWorkspace.mockResolvedValue(workspace);
    assertAiRateLimit.mockResolvedValue(undefined);
    generateAiExplanation.mockResolvedValue({
      whyItFailed: "fresh",
      impact: "fresh",
      howToFix: "fresh",
      provenance: "ai",
      model: "test-model",
      confidence: "medium",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await generateAiExplanationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.message).toBe("AI explanation added.");
    const explanations = projectWritePayload()?.findings?.[0]?.explanations;
    expect(explanations).toHaveLength(6);
    expect(explanations?.[0]?.whyItFailed).toBe("base");
    expect(explanations?.[5]?.whyItFailed).toBe("fresh");
  });

  it("errors when AI explanation is unavailable", async () => {
    const workspace = workspaceFor("member");
    mockProjectWrite(workspace);
    actionWorkspaceMocks.getWorkspace.mockResolvedValue(workspace);
    assertAiRateLimit.mockResolvedValue(undefined);
    generateAiExplanation.mockResolvedValue(null);

    const result = await generateAiExplanationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.ok ? null : result.message).toMatch(
      /AI explanation unavailable/,
    );
  });
});

describe("generateAiRemediationAction", () => {
  it("rejects non-open findings", async () => {
    const workspace = workspaceFor("member");
    const openFinding = workspace.db.findings[0];
    if (!openFinding) throw new Error("expected finding");
    openFinding.status = "resolved";
    mockProjectWrite(workspace);
    actionWorkspaceMocks.getWorkspace.mockResolvedValue(workspace);
    assertAiRateLimit.mockResolvedValue(undefined);

    const result = await generateAiRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(
      /only available for open findings/,
    );
  });

  it("rejects remediations past the suggestion stage", async () => {
    const workspace = workspaceFor("member", "approved");
    mockProjectWrite(workspace);
    actionWorkspaceMocks.getWorkspace.mockResolvedValue(workspace);
    assertAiRateLimit.mockResolvedValue(undefined);

    const result = await generateAiRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(/before approval/);
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
    mockProjectWrite(workspace);
    actionWorkspaceMocks.getWorkspace.mockResolvedValue(workspace);
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
      initialActionState,
      new FormData(),
    );

    expect(result.message).toBe("AI remediation suggestion saved.");
    expect(projectWritePayload()?.remediations?.[0]?.status).toBe("suggested");
    expect(projectWritePayload()?.findings?.[0]?.fix).toMatchObject({
      value: "Cart icon",
    });
    const suggestionEvidence = projectWritePayload()?.evidence?.find(
      (row) => row.kind === "ai_remediation_suggested",
    );
    expect(suggestionEvidence).toBeDefined();
    // Staleness anchor for the finding page.
    expect(suggestionEvidence?.detail).toMatchObject({
      locationRef: expect.any(String),
    });
  });

  it("refreshes an existing suggested remediation", async () => {
    const workspace = workspaceFor("member", "suggested");
    mockProjectWrite(workspace);
    actionWorkspaceMocks.getWorkspace.mockResolvedValue(workspace);
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
      initialActionState,
      new FormData(),
    );

    expect(result.message).toBe("AI remediation suggestion saved.");
    expect(projectWritePayload()?.remediations?.[0]?.status).toBe("suggested");
    // The refresh note lives on the evidence row now, not in history[].
    expect(
      projectWritePayload()?.evidence?.find(
        (row) => row.kind === "ai_remediation_suggested",
      )?.detail,
    ).toMatchObject({ description: "Refined alt" });
  });

  it("errors when AI remediation is unavailable", async () => {
    const workspace = workspaceFor("member", "detected");
    mockProjectWrite(workspace);
    actionWorkspaceMocks.getWorkspace.mockResolvedValue(workspace);
    assertAiRateLimit.mockResolvedValue(undefined);
    generateAiRemediation.mockResolvedValue(null);

    const result = await generateAiRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(
      /AI remediation unavailable/,
    );
  });

  it("never opens a write when the AI call fails", async () => {
    const workspace = workspaceFor("member", "detected");
    mockProjectWrite(workspace);
    actionWorkspaceMocks.getWorkspace.mockResolvedValue(workspace);
    assertAiRateLimit.mockResolvedValue(undefined);
    generateAiRemediation.mockResolvedValue(null);

    const result = await generateAiRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.ok ? null : result.message).toMatch(
      /AI remediation unavailable/,
    );
    // The AI call runs before the project write lock is taken, so a failed
    // AI call must not open a write at all.
    expect(actionWorkspaceMocks.withProjectWrite).not.toHaveBeenCalled();
    expect(projectWritePayload()).toBeUndefined();
  });

  it("never opens a write when the AI explanation fails", async () => {
    const workspace = workspaceFor("member");
    mockProjectWrite(workspace);
    actionWorkspaceMocks.getWorkspace.mockResolvedValue(workspace);
    assertAiRateLimit.mockResolvedValue(undefined);
    generateAiExplanation.mockResolvedValue(null);

    const result = await generateAiExplanationAction(
      "f1",
      initialActionState,
      new FormData(),
    );

    expect(result.ok ? null : result.message).toMatch(
      /AI explanation unavailable/,
    );
    expect(actionWorkspaceMocks.withProjectWrite).not.toHaveBeenCalled();
    expect(projectWritePayload()).toBeUndefined();
  });
});
