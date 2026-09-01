import "@/test-fixtures/register-action-workspace-mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Control, Requirement } from "@/core/project-types";
import { actionWorkspaceMocks } from "@/test-fixtures/action-workspace-mocks";
import { testControl } from "@/test-fixtures/control";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";
import { testWorkspace } from "@/test-fixtures/workspace";
import { emptyActionMessageState } from "../action-state";
import {
  markRemediationImplementedAction,
  manualVerifyRemediationAction,
  verifyRemediationAction,
} from "./remediation-verify";
import {
  dismissFindingAction,
  bulkDismissFindingsAction,
} from "./remediation";
import {
  clearRequirementExceptionAction,
  clearRequirementHumanPassAction,
  markRequirementExceptionAction,
  markRequirementPassedAction,
} from "./requirements";
import { markAlertReadAction } from "./alerts";
import type { Db } from "../db";
import type { Workspace } from "../workspace";

const { withWorkspaceWrite, getWorkspace } = actionWorkspaceMocks;
const locateViolationInProject = vi.hoisted(() => vi.fn());
const refreshRequirementStatuses = vi.hoisted(() => vi.fn());

vi.mock("../repo-checkout", () => ({
  withProjectCheckout: async (
    _project: unknown,
    fn: (rootPath: string) => Promise<unknown>,
  ) => fn("/tmp/ephemeral-checkout"),
  withRepoCheckout: vi.fn(),
}));

vi.mock("../observability", () => ({
  reportError: vi.fn(),
  reportWarning: vi.fn(),
}));

vi.mock("../assessment-helpers", () => ({
  buildSuggestion: vi.fn(() => null),
  locateViolationInProject: (...args: unknown[]) =>
    locateViolationInProject(...args),
  mergeFix: vi.fn((existing, fresh) => fresh ?? existing),
}));

vi.mock("../assessment-status", () => ({
  refreshRequirementStatuses: (...args: unknown[]) =>
    refreshRequirementStatuses(...args),
}));

const project = testProject({ orgId: "org-1" });

const control = testControl();

const manualControl = testControl({
  id: "c-manual",
  code: "CUST-1",
  checkId: null,
});

const finding = testFinding();

function baseWorkspace(overrides: Partial<Db> = {}): Workspace {
  const { findings, remediations, ...rest } = overrides;
  return testWorkspace({
    role: "member",
    userId: "user-1",
    project,
    findings: findings ?? [finding],
    remediations:
      remediations ??
      [
        testRemediation({ status: "implemented", suggestion: null, history: [] }),
      ],
    db: {
      controls: [control, manualControl],
      requirements: [],
      alerts: [],
      ...rest,
    },
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("verifyRemediationAction", () => {
  it("reports still-failing when the violation is still located", async () => {
    const workspace = baseWorkspace();
    getWorkspace.mockResolvedValue(workspace);
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
    getWorkspace.mockResolvedValue(workspace);
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

describe("manualVerifyRemediationAction", () => {
  it("requires a verification note", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) => fn(baseWorkspace()));
    const result = await manualVerifyRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/verification note is required/);
  });

  it("requires implemented status", async () => {
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
    form.set("note", "Checked in staging");

    const result = await manualVerifyRemediationAction(
      "f1",
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/requires status implemented/);
  });

  it("manually verifies an implemented remediation", async () => {
    const workspace = baseWorkspace();
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    const form = new FormData();
    form.set("note", "Checked in staging");

    const result = await manualVerifyRemediationAction(
      "f1",
      emptyActionMessageState,
      form,
    );

    expect(result.message).toBe("Manually verified.");
    expect(workspace.db.remediations[0]?.status).toBe("verified");
    expect(workspace.db.findings[0]?.status).toBe("resolved");
    expect(refreshRequirementStatuses).toHaveBeenCalledWith(workspace.db, "p1");
    expect(
      workspace.db.evidence.some(
        (row) => row.kind === "remediation_manually_verified",
      ),
    ).toBe(true);
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

describe("bulkDismissFindingsAction", () => {
  it("requires at least one finding id", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) => fn(baseWorkspace()));
    const form = new FormData();
    form.set("reason", "accepted_risk");
    const result = await bulkDismissFindingsAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Select at least one finding/);
  });

  it("requires a valid dismissal reason", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) => fn(baseWorkspace()));
    const form = new FormData();
    form.append("findingIds", "f1");
    const result = await bulkDismissFindingsAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/dismissal reason/i);
  });

  it("dismisses open findings and skips closed ones", async () => {
    const workspace = baseWorkspace({
      findings: [
        { ...finding, id: "f1", status: "open" },
        { ...finding, id: "f2", status: "resolved" },
      ],
      remediations: [],
    });
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
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
    expect(workspace.db.findings[0]?.status).toBe("dismissed");
    expect(workspace.db.findings[0]?.dismissal?.reason).toBe("not_applicable");
    expect(workspace.db.findings[1]?.status).toBe("resolved");
    expect(refreshRequirementStatuses).toHaveBeenCalledWith(workspace.db, "p1");
  });

  it("errors when no open findings were dismissed", async () => {
    const workspace = baseWorkspace({
      findings: [{ ...finding, status: "dismissed" }],
    });
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
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

describe("markAlertReadAction", () => {
  it("marks a project alert as read", async () => {
    const workspace = baseWorkspace({
      alerts: [
        {
          id: "alert-1",
          projectId: "p1",
          kind: "compliance_regression",
          summary: "Regressed",
          at: "2026-01-01T00:00:00.000Z",
          read: false,
        },
      ],
    });
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));
    const form = new FormData();
    form.set("alertId", "alert-1");

    const result = await markAlertReadAction(emptyActionMessageState, form);
    expect(result.message).toBe("Alert marked as read.");
    expect(workspace.db.alerts[0]?.read).toBe(true);
  });

  it("rejects an unknown alert id", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) => fn(baseWorkspace()));
    const form = new FormData();
    form.set("alertId", "missing");
    const result = await markAlertReadAction(emptyActionMessageState, form);
    expect(result.error).toMatch(/Unknown alert/);
  });

  it("requires an alert id", async () => {
    withWorkspaceWrite.mockImplementation(async (fn) => fn(baseWorkspace()));
    const result = await markAlertReadAction(
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/Unknown alert/);
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

  it("records a temporary exception with expiry", async () => {
    const requirement: Requirement = {
      id: "req-temp",
      projectId: "p1",
      controlId: "c1",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));

    const form = new FormData();
    form.set("reason", "temporary");
    form.set("note", "Fix landing next sprint");
    form.set("expiresAt", "2026-12-31");

    const result = await markRequirementExceptionAction(
      "req-temp",
      emptyActionMessageState,
      form,
    );

    expect(result.message).toBe("Exception recorded.");
    expect(workspace.db.requirements[0]?.status).toBe("failed");
    expect(workspace.db.requirements[0]?.exception?.expiresAt).toMatch(
      /^2026-12-31/,
    );
  });

  it("requires expiry for temporary exceptions", async () => {
    const requirement: Requirement = {
      id: "req-temp-2",
      projectId: "p1",
      controlId: "c1",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));

    const form = new FormData();
    form.set("reason", "temporary");
    form.set("note", "needs date");

    const result = await markRequirementExceptionAction(
      "req-temp-2",
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/expiry date/i);
  });

  it("requires a note for exceptions", async () => {
    const requirement: Requirement = {
      id: "req-note",
      projectId: "p1",
      controlId: "c1",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));

    const form = new FormData();
    form.set("reason", "accepted_risk");

    const result = await markRequirementExceptionAction(
      "req-note",
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/note is required/i);
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

  it("rejects human pass on automated controls", async () => {
    const requirement: Requirement = {
      id: "req-auto",
      projectId: "p1",
      controlId: "c1",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));

    const form = new FormData();
    form.set("note", "should not work");

    const result = await markRequirementPassedAction(
      "req-auto",
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Only manual controls/);
  });

  it("clears a human pass and refreshes status", async () => {
    const requirement: Requirement = {
      id: "req-pass",
      projectId: "p1",
      controlId: "c-manual",
      status: "passed",
      determination: "human_review",
      updatedAt: "2026-01-01T00:00:00.000Z",
      humanPass: {
        note: "ok",
        at: "2026-01-01T00:00:00.000Z",
      },
    };
    const workspace = requirementWorkspace(requirement);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));

    const result = await clearRequirementHumanPassAction(
      "req-pass",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.message).toBe("Human pass cleared.");
    expect(workspace.db.requirements[0]?.humanPass).toBeUndefined();
    expect(refreshRequirementStatuses).toHaveBeenCalledWith(
      workspace.db,
      "p1",
    );
  });

  it("errors when clearing a missing human pass", async () => {
    const requirement: Requirement = {
      id: "req-no-pass",
      projectId: "p1",
      controlId: "c-manual",
      status: "unable_to_verify",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));

    const result = await clearRequirementHumanPassAction(
      "req-no-pass",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/no human pass/i);
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

  it("errors when clearing a missing exception", async () => {
    const requirement: Requirement = {
      id: "req-no-ex",
      projectId: "p1",
      controlId: "c1",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    withWorkspaceWrite.mockImplementation(async (fn) => fn(workspace));

    const result = await clearRequirementExceptionAction(
      "req-no-ex",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/no exception/i);
  });
});
