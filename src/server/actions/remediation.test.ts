import "@/test-fixtures/register-action-workspace-mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionWorkspaceMocks, clearProjectWritePayloads, invokeProjectWriteMock, projectWritePayload } from "@/test-fixtures/action-workspace-mocks";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";
import { testWorkspace } from "@/test-fixtures/workspace";
import { RateLimitError } from "../rate-limit";
import { emptyActionMessageState } from "../action-state";
import { runAssessmentAction } from "./assessment";
import {
  approveRemediationAction,
  bulkApproveRemediationsAction,
  bulkDismissFindingsAction,
  dismissFindingAction,
} from "./remediation";

const { withProjectWrite } = actionWorkspaceMocks;
const enqueueAssessmentJob = vi.hoisted(() => vi.fn());
const processNextAssessmentJob = vi.hoisted(() => vi.fn());
const assertAssessRateLimit = vi.hoisted(() => vi.fn());
const applyRequirementStatusRefresh = vi.hoisted(() => vi.fn());

vi.mock("@/ai/explainer", () => ({
  generateAiExplanation: vi.fn(),
  aiExplanationAvailable: () => false,
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

vi.mock("../assessment", () => ({
  runAssessment: vi.fn(),
}));

vi.mock("../assessment-jobs", () => ({
  enqueueAssessmentJob: (...args: unknown[]) => enqueueAssessmentJob(...args),
}));

vi.mock("../assessment-worker", () => ({
  processNextAssessmentJob: (...args: unknown[]) =>
    processNextAssessmentJob(...args),
}));

vi.mock("../rate-limit", async () => {
  const actual = await vi.importActual<typeof import("../rate-limit")>(
    "../rate-limit",
  );
  return {
    ...actual,
    assertAssessRateLimit: (...args: unknown[]) =>
      assertAssessRateLimit(...args),
  };
});

vi.mock("../assessment-status", async () => {
  const actual = await vi.importActual<typeof import("../assessment-status")>(
    "../assessment-status",
  );
  return {
    ...actual,
    applyRequirementStatusRefresh: (...args: unknown[]) => applyRequirementStatusRefresh(...args),
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspaceFor("viewer"), fn));
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    const result = await approveRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result).toEqual({
      error: null,
      message: "Remediation approved.",
    });
    expect(projectWritePayload()?.remediations?.[0]?.status).toBe("approved");
  });

  it("denies dismiss for viewers", async () => {
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspaceFor("viewer"), fn));
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
    actionWorkspaceMocks.withProjectWrite.mockImplementation(async (_scope, fn) =>
      invokeProjectWriteMock(workspaceFor("viewer"), fn),
    );
    const result = await runAssessmentAction(
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/Not allowed/);
  });
});

describe("bulkApproveRemediationsAction", () => {
  it("requires at least one finding id", async () => {
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspaceFor("member"), fn));
    const result = await bulkApproveRemediationsAction(
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/Select at least one finding/);
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));

    const form = new FormData();
    form.append("findingIds", "f1");
    form.append("findingIds", "f2");

    const result = await bulkApproveRemediationsAction(
      emptyActionMessageState,
      form,
    );

    expect(result).toEqual({
      error: null,
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));

    const form = new FormData();
    form.append("findingIds", "f1");

    const result = await bulkApproveRemediationsAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/No selected findings had runtime guidance/);
  });
});

describe("runAssessmentAction", () => {
  it("queues and drains inline when enabled", async () => {
    const workspace = workspaceFor("member");
    actionWorkspaceMocks.withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    enqueueAssessmentJob.mockResolvedValue({ id: "job-1" });
    processNextAssessmentJob.mockResolvedValue({ kind: "idle" });
    assertAssessRateLimit.mockResolvedValue(undefined);
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_AUTH_ENABLED", "");

    const result = await runAssessmentAction(
      emptyActionMessageState,
      new FormData(),
    );

    expect(result).toEqual({
      error: null,
      message: "Assessment complete.",
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
    actionWorkspaceMocks.withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    enqueueAssessmentJob.mockResolvedValue({ id: "job-2" });
    assertAssessRateLimit.mockResolvedValue(undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_ENABLED", "");

    const result = await runAssessmentAction(
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.message).toMatch(/Assessment queued/);
    expect(processNextAssessmentJob).not.toHaveBeenCalled();
  });

  it("surfaces rate limit errors", async () => {
    const workspace = workspaceFor("member");
    actionWorkspaceMocks.withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    assertAssessRateLimit.mockRejectedValue(new RateLimitError());

    const result = await runAssessmentAction(
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.error).toMatch(/Too many requests/);
    expect(enqueueAssessmentJob).not.toHaveBeenCalled();
  });
});

describe("dismissFindingAction", () => {
  it("dismisses with a documented reason", async () => {
    const workspace = workspaceFor("member");
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    const form = new FormData();
    form.set("reason", "false_positive");
    form.set("note", "decorative");

    const result = await dismissFindingAction(
      "f1",
      emptyActionMessageState,
      form,
    );

    expect(result.message).toMatch(/dismissed/i);
    expect(projectWritePayload()?.findings?.[0]?.status).toBe("dismissed");
    expect(applyRequirementStatusRefresh).toHaveBeenCalled();
  });

  it("requires a valid dismissal reason", async () => {
    const workspace = workspaceFor("member");
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    const result = await dismissFindingAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/dismissal reason/i);
  });
});

describe("bulkDismissFindingsAction", () => {
  it("requires at least one finding id", async () => {
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspaceFor("member"), fn));
    const form = new FormData();
    form.set("reason", "accepted_risk");
    const result = await bulkDismissFindingsAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Select at least one finding/);
  });

  it("requires a valid dismissal reason", async () => {
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspaceFor("member"), fn));
    const form = new FormData();
    form.append("findingIds", "f1");
    const result = await bulkDismissFindingsAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/dismissal reason/i);
  });

  it("dismisses open findings and skips closed ones", async () => {
    const workspace = workspaceFor("member");
    workspace.db.findings = [
      { ...finding, id: "f1", status: "open" },
      { ...finding, id: "f2", status: "resolved" },
    ];
    workspace.db.remediations = [];
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    const form = new FormData();
    form.append("findingIds", "f1");
    form.append("findingIds", "f2");
    form.set("reason", "not_applicable");
    form.set("note", "out of scope");

    const result = await bulkDismissFindingsAction(
      emptyActionMessageState,
      form,
    );

    expect(result).toEqual({
      error: null,
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    const form = new FormData();
    form.append("findingIds", "f1");
    form.set("reason", "false_positive");

    const result = await bulkDismissFindingsAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/No open findings were dismissed/);
  });
});
