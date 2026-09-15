import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearProjectWritePayloads,
  mockProjectWrite,
  projectWritePayload,
} from "@/test-fixtures/action-workspace-mocks";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";
import { testWorkspace } from "@/test-fixtures/workspace";

import { initialActionState } from "../action-state";
import { RateLimitError } from "../rate-limit";
import { runAssessmentAction } from "./assessment";
import {
  approveRemediationAction,
  bulkApproveRemediationsAction,
  bulkDismissFindingsAction,
  dismissFindingAction,
} from "./remediation";

const enqueueAssessmentJob = vi.hoisted(() => vi.fn());
const processNextAssessmentJob = vi.hoisted(() => vi.fn());
const assertAssessRateLimit = vi.hoisted(() => vi.fn());
const applyRequirementStatusRefresh = vi.hoisted(() => vi.fn());

vi.mock("@/ai/explainer", () => ({
  generateAiExplanation: vi.fn(),
}));

vi.mock("@/ai/remediation", () => ({
  generateAiRemediation: vi.fn(),
}));

vi.mock("../observability", () => ({
  reportError: vi.fn(),
  reportWarning: vi.fn(),
  reportDebug: vi.fn(),
  reportInfo: vi.fn(),
  reportAppError: vi.fn(),
}));

vi.mock("../assessment/assessment", () => ({
  runAssessment: vi.fn(),
}));

vi.mock("../assessment/assessment-jobs", () => ({
  enqueueAssessmentJob: (...args: unknown[]) => enqueueAssessmentJob(...args),
}));

vi.mock("../assessment/assessment-worker", () => ({
  processNextAssessmentJob: (...args: unknown[]) =>
    processNextAssessmentJob(...args),
}));

vi.mock("../rate-limit", async () => {
  const actual =
    await vi.importActual<typeof import("../rate-limit")>("../rate-limit");
  return {
    ...actual,
    assertAssessRateLimit: (...args: unknown[]) =>
      assertAssessRateLimit(...args),
  };
});

vi.mock("../assessment/assessment-status", async () => {
  const actual = await vi.importActual<
    typeof import("../assessment/assessment-status")
  >("../assessment/assessment-status");
  return {
    ...actual,
    applyRequirementStatusRefresh: (...args: unknown[]) =>
      applyRequirementStatusRefresh(...args),
  };
});

const project = testProject({ orgId: "org-1" });
const finding = testFinding();
const remediation = testRemediation();

function workspaceFor(role: "viewer" | "member" | "admin" | "owner") {
  return testWorkspace({
    role,
    project,
    findings: [finding],
    remediations: [remediation],
  });
}

afterEach(() => {
  clearProjectWritePayloads();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("remediation action authz", () => {
  it("denies approve for viewers", async () => {
    mockProjectWrite(workspaceFor("viewer"));
    const result = await approveRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(/Not allowed/);
    expect(result.ok).toBe(false);
  });

  it("approves for members", async () => {
    const workspace = workspaceFor("member");
    mockProjectWrite(workspace);
    const result = await approveRemediationAction(
      "f1",
      initialActionState,
      new FormData(),
    );
    expect(result).toEqual({
      ok: true,
      message: "Remediation approved.",
    });
    expect(projectWritePayload()?.remediations?.[0]?.status).toBe("approved");
  });

  it("denies dismiss for viewers", async () => {
    mockProjectWrite(workspaceFor("viewer"));
    const formData = new FormData();
    formData.set("reason", "false_positive");
    formData.set("note", "not a real issue");
    const result = await dismissFindingAction(
      "f1",
      initialActionState,
      formData,
    );
    expect(result.ok ? null : result.message).toMatch(/Not allowed/);
  });

  it("denies run assessment for viewers", async () => {
    mockProjectWrite(workspaceFor("viewer"));
    const result = await runAssessmentAction(
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(/Not allowed/);
  });
});

describe("bulkApproveRemediationsAction", () => {
  it("requires at least one finding id", async () => {
    mockProjectWrite(workspaceFor("member"));
    const result = await bulkApproveRemediationsAction(
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(
      /Select at least one finding/,
    );
  });

  it("approves suggested runtime remediations and skips source findings", async () => {
    const workspace = workspaceFor("member");
    const runtimeFinding = testFinding({
      id: "f2",
      location: {
        kind: "dom",
        url: "https://example.com/login",
        selector: "input#email",
        snippet: "<input id='email'>",
      },
    });
    workspace.db.findings.push(runtimeFinding);
    workspace.db.remediations.push(
      {
        id: "r2",
        findingId: "f2",
        status: "suggested",
        suggestion: {
          description: "Associate a label",
          proposedSnippet: "<label>Email</label>",
          provenance: "ai",
        },
        history: [],
      },
      {
        id: "r3",
        findingId: "f3",
        status: "approved",
        suggestion: null,
        history: [],
      },
    );
    mockProjectWrite(workspace);

    const form = new FormData();
    form.append("findingIds", "f1");
    form.append("findingIds", "f2");

    const result = await bulkApproveRemediationsAction(
      initialActionState,
      form,
    );

    expect(result).toEqual({
      ok: true,
      message: "Approved 1 remediation.",
    });
    const payload = projectWritePayload();
    expect(payload?.remediations).toHaveLength(1);
    expect(payload?.remediations?.[0]?.status).toBe("approved");
  });

  it("errors when nothing was eligible to approve", async () => {
    const workspace = workspaceFor("member");
    const remediationRow = workspace.db.remediations[0];
    if (!remediationRow) throw new Error("expected remediation");
    remediationRow.status = "approved";
    mockProjectWrite(workspace);

    const form = new FormData();
    form.append("findingIds", "f1");

    const result = await bulkApproveRemediationsAction(
      initialActionState,
      form,
    );
    expect(result.ok ? null : result.message).toMatch(
      /No selected findings had guidance/,
    );
  });
});

describe("runAssessmentAction", () => {
  it("queues and drains inline when enabled", async () => {
    const workspace = workspaceFor("member");
    mockProjectWrite(workspace);
    enqueueAssessmentJob.mockResolvedValue({ id: "job-1" });
    processNextAssessmentJob.mockResolvedValue({ kind: "idle" });
    assertAssessRateLimit.mockResolvedValue(undefined);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_AUTH_ENABLED", "");

    const result = await runAssessmentAction(
      initialActionState,
      new FormData(),
    );

    expect(result).toEqual({
      ok: true,
      message: "No assessment jobs were ready to run.",
    });
    expect(enqueueAssessmentJob).toHaveBeenCalledWith({
      projectId: "p1",
      trigger: "manual",
      requestedByUserId: "user-1",
    });
    expect(processNextAssessmentJob).toHaveBeenCalled();
    expect(
      projectWritePayload()?.evidence?.some(
        (row) => row.kind === "assessment_job",
      ),
    ).toBe(true);
  });

  it("returns queued message when inline drain is disabled", async () => {
    const workspace = workspaceFor("member");
    mockProjectWrite(workspace);
    enqueueAssessmentJob.mockResolvedValue({ id: "job-2" });
    assertAssessRateLimit.mockResolvedValue(undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_ENABLED", "");

    const result = await runAssessmentAction(
      initialActionState,
      new FormData(),
    );

    expect(result.message).toMatch(/Assessment queued/);
    expect(processNextAssessmentJob).not.toHaveBeenCalled();
  });

  it("surfaces rate limit errors", async () => {
    const workspace = workspaceFor("member");
    mockProjectWrite(workspace);
    assertAssessRateLimit.mockRejectedValue(new RateLimitError());

    const result = await runAssessmentAction(
      initialActionState,
      new FormData(),
    );

    expect(result.ok ? null : result.message).toMatch(/Too many requests/);
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
  });
});

describe("dismissFindingAction", () => {
  it("dismisses with a documented reason", async () => {
    const workspace = workspaceFor("member");
    mockProjectWrite(workspace);
    const form = new FormData();
    form.set("reason", "false_positive");
    form.set("note", "decorative");

    const result = await dismissFindingAction("f1", initialActionState, form);

    expect(result.message).toMatch(/dismissed/i);
    expect(projectWritePayload()?.findings?.[0]?.status).toBe("dismissed");
    expect(applyRequirementStatusRefresh).toHaveBeenCalled();
  });

  it("requires a valid dismissal reason", async () => {
    const workspace = workspaceFor("member");
    mockProjectWrite(workspace);
    const result = await dismissFindingAction(
      "f1",
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(/dismissal reason/i);
  });
});

describe("bulkDismissFindingsAction", () => {
  it("requires at least one finding id", async () => {
    mockProjectWrite(workspaceFor("member"));
    const form = new FormData();
    form.set("reason", "accepted_risk");
    const result = await bulkDismissFindingsAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(
      /Select at least one finding/,
    );
  });

  it("requires a valid dismissal reason", async () => {
    mockProjectWrite(workspaceFor("member"));
    const form = new FormData();
    form.append("findingIds", "f1");
    const result = await bulkDismissFindingsAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(/dismissal reason/i);
  });

  it("dismisses open findings and skips closed ones", async () => {
    const workspace = workspaceFor("member");
    workspace.db.findings = [
      { ...finding, id: "f1", status: "open" },
      { ...finding, id: "f2", status: "resolved" },
    ];
    workspace.db.remediations = [];
    mockProjectWrite(workspace);
    const form = new FormData();
    form.append("findingIds", "f1");
    form.append("findingIds", "f2");
    form.set("reason", "not_applicable");
    form.set("note", "out of scope");

    const result = await bulkDismissFindingsAction(initialActionState, form);

    expect(result).toEqual({
      ok: true,
      message: "Dismissed 1 finding.",
    });
    const payload = projectWritePayload();
    expect(payload?.findings?.[0]?.status).toBe("dismissed");
    expect(payload?.findings?.[0]?.dismissal?.reason).toBe("not_applicable");
    expect(payload?.findings?.[1]).toBeUndefined();
    expect(applyRequirementStatusRefresh).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ id: "p1" }),
      expect.objectContaining({ controlIds: ["ctl-img-alt"] }),
    );
  });

  it("errors when no open findings were dismissed", async () => {
    const workspace = workspaceFor("member");
    workspace.db.findings = [{ ...finding, status: "dismissed" }];
    mockProjectWrite(workspace);
    const form = new FormData();
    form.append("findingIds", "f1");
    form.set("reason", "false_positive");

    const result = await bulkDismissFindingsAction(initialActionState, form);
    expect(result.ok ? null : result.message).toMatch(
      /No open findings were dismissed/,
    );
  });
});
