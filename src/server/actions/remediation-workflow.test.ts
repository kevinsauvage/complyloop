import "@/test-fixtures/register-action-workspace-mock";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Control, Requirement } from "@complyloop/domain/project-types";
import {
  actionAuthMocks,
  actionWorkspaceMocks,
  invokeProjectWriteMock,
} from "@/test-fixtures/action-workspace-mocks";
import { testControl } from "@/test-fixtures/control";
import { testFinding } from "@/test-fixtures/finding";
import { testMembership } from "@/test-fixtures/membership";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";
import { testWorkspace } from "@/test-fixtures/workspace";
import { emptyActionMessageState } from "../action-state";
import {
  markRemediationImplementedAction,
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

const { withProjectWrite, getWorkspace, withProjectLock } =
  actionWorkspaceMocks;
const locateViolationInProject = vi.hoisted(() => vi.fn());
const runtimeViolationStillPresent = vi.hoisted(() => vi.fn());
const scanRuntime = vi.hoisted(() => vi.fn());
const refreshRequirementStatusesForControls = vi.hoisted(() => vi.fn());
const markAlertRead = vi.hoisted(() => vi.fn());
const getAlertById = vi.hoisted(() => vi.fn());
const getProjectById = vi.hoisted(() => vi.fn());
const listMembershipsForOrgs = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());

vi.mock("@complyloop/db/client", () => ({
  getDrizzle: async () => ({ transaction }),
}));

vi.mock("@complyloop/db/repo/alerts", () => ({
  markAlertRead: (...args: unknown[]) => markAlertRead(...args),
  getAlertById: (...args: unknown[]) => getAlertById(...args),
}));

vi.mock("@complyloop/db/repo/projects", () => ({
  getProjectById: (...args: unknown[]) => getProjectById(...args),
}));

vi.mock("@complyloop/db/repo/orgs", () => ({
  listMembershipsForOrgs: (...args: unknown[]) => listMembershipsForOrgs(...args),
}));

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
  refreshRequirementStatusesForControls: (...args: unknown[]) =>
    refreshRequirementStatusesForControls(...args),
}));

vi.mock("@complyloop/analysis-core/runtime/scan", () => ({
  runtimeViolationStillPresent: (...args: unknown[]) =>
    runtimeViolationStillPresent(...args),
  scanRuntime: (...args: unknown[]) => scanRuntime(...args),
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
  it("refuses to verify a source finding by applying a local patch", async () => {
    const workspace = baseWorkspace();
    getWorkspace.mockResolvedValue(workspace);

    const result = await verifyRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.error).toMatch(/draft pull request|re-assess/i);
    expect(workspace.db.remediations[0]?.status).toBe("implemented");
    expect(locateViolationInProject).not.toHaveBeenCalled();
  });

  it("rejects automated verify until the remediation is implemented", async () => {
    const workspace = baseWorkspace({
      remediations: [
        testRemediation({ status: "approved", suggestion: null, history: [] }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);

    const result = await verifyRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.error).toMatch(/implemented/);
    expect(workspace.db.remediations[0]?.status).toBe("approved");
  });

  it("verifies a runtime finding when the DOM re-audit is clean", async () => {
    const workspace = baseWorkspace({
      findings: [
        testFinding({
          location: {
            kind: "dom",
            url: "https://preview.test/",
            selector: "img",
            snippet: "<img>",
          },
        }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    runtimeViolationStillPresent.mockResolvedValue(false);

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
    expect(refreshRequirementStatusesForControls).toHaveBeenCalledWith(
      workspace.db,
      "p1",
      ["c1"],
      expect.objectContaining({ runtimeRan: true, writes: expect.any(Object) }),
    );
  });

  it("verifies a site-level finding only after a clean site-level re-audit", async () => {
    const workspace = baseWorkspace({
      findings: [
        testFinding({
          checkId: "consistent-nav",
          location: {
            kind: "site",
            pages: ["/", "/about"],
            detail: "Navigation differs across pages",
          },
        }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 2,
      siteLevelChecksRan: true,
    });

    const result = await verifyRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result).toEqual({
      error: null,
      message: "Fix verified by automated re-check.",
    });
    expect(locateViolationInProject).not.toHaveBeenCalled();
    expect(workspace.db.remediations[0]?.status).toBe("verified");
    expect(refreshRequirementStatusesForControls).toHaveBeenCalledWith(
      workspace.db,
      "p1",
      ["c1"],
      expect.objectContaining({
        runtimeRan: true,
        siteLevelChecksRan: true,
        writes: expect.any(Object),
      }),
    );
  });

  it("does not verify a site-level finding when the site-level audit did not run", async () => {
    const workspace = baseWorkspace({
      findings: [
        testFinding({
          checkId: "consistent-nav",
          location: {
            kind: "site",
            pages: ["/", "/about"],
            detail: "Navigation differs across pages",
          },
        }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    scanRuntime.mockResolvedValue({
      findings: [],
      pagesScanned: 1,
      siteLevelChecksRan: false,
    });

    const result = await verifyRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.error).toMatch(/still failing|still detected/i);
    expect(workspace.db.remediations[0]?.status).toBe("implemented");
  });

  it("reports still-failing when the runtime finding is still on the page", async () => {
    const workspace = baseWorkspace({
      findings: [
        testFinding({
          location: {
            kind: "dom",
            url: "https://preview.test/",
            selector: "img",
            snippet: "<img>",
          },
        }),
      ],
    });
    getWorkspace.mockResolvedValue(workspace);
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
    runtimeViolationStillPresent.mockResolvedValue(true);

    const result = await verifyRemediationAction(
      "f1",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.error).toMatch(/still failing|still detected/i);
    expect(workspace.db.remediations[0]?.status).toBe("implemented");
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));
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
    expect(workspace.db.findings[0]?.status).toBe("dismissed");
    expect(refreshRequirementStatusesForControls).toHaveBeenCalled();
  });

  it("requires a valid dismissal reason", async () => {
    const workspace = baseWorkspace();
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(baseWorkspace(), fn));
    const form = new FormData();
    form.set("reason", "accepted_risk");
    const result = await bulkDismissFindingsAction(
      emptyActionMessageState,
      form,
    );
    expect(result.error).toMatch(/Select at least one finding/);
  });

  it("requires a valid dismissal reason", async () => {
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(baseWorkspace(), fn));
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
    expect(workspace.db.findings[0]?.status).toBe("dismissed");
    expect(workspace.db.findings[0]?.dismissal?.reason).toBe("not_applicable");
    expect(workspace.db.findings[1]?.status).toBe("resolved");
    expect(refreshRequirementStatusesForControls).toHaveBeenCalledWith(
      workspace.db,
      "p1",
      ["c1"],
      expect.objectContaining({ writes: expect.any(Object) }),
    );
  });

  it("errors when no open findings were dismissed", async () => {
    const workspace = baseWorkspace({
      findings: [{ ...finding, status: "dismissed" }],
    });
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

describe("markAlertReadAction", () => {
  const alert = {
    id: "alert-1",
    projectId: "p1",
    kind: "compliance_regression" as const,
    summary: "Regressed",
    at: "2026-01-01T00:00:00.000Z",
    read: false,
  };

  function signIn(): void {
    actionAuthMocks.auth.mockResolvedValue({
      user: { id: "user-1", login: "alice" },
    });
  }

  it("marks a project alert as read without a workspace load", async () => {
    signIn();
    getAlertById.mockResolvedValue(alert);
    getProjectById.mockResolvedValue(project);
    listMembershipsForOrgs.mockResolvedValue([
      testMembership("member", { orgId: project.orgId, userId: "user-1" }),
    ]);
    withProjectLock.mockImplementation(async (_id, fn) => fn({}));
    const form = new FormData();
    form.set("alertId", "alert-1");

    const result = await markAlertReadAction(emptyActionMessageState, form);
    expect(result.message).toBe("Alert marked as read.");
    expect(markAlertRead).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "alert-1", read: false }),
    );
    expect(getWorkspace).not.toHaveBeenCalled();
  });

  it("rejects a viewer without membership in the alert's org", async () => {
    signIn();
    getAlertById.mockResolvedValue(alert);
    getProjectById.mockResolvedValue(project);
    listMembershipsForOrgs.mockResolvedValue([]);
    const form = new FormData();
    form.set("alertId", "alert-1");

    const result = await markAlertReadAction(emptyActionMessageState, form);
    expect(result.error).toMatch(/Not allowed/);
    expect(markAlertRead).not.toHaveBeenCalled();
  });

  it("rejects an unknown alert id", async () => {
    signIn();
    getAlertById.mockResolvedValue(undefined);
    const form = new FormData();
    form.set("alertId", "missing");
    const result = await markAlertReadAction(emptyActionMessageState, form);
    expect(result.error).toMatch(/Unknown alert/);
  });

  it("requires an alert id", async () => {
    signIn();
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));

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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));

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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));

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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));

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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));

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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));

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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));

    const result = await clearRequirementHumanPassAction(
      "req-pass",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.message).toBe("Human pass cleared.");
    expect(workspace.db.requirements[0]?.humanPass).toBeUndefined();
    expect(refreshRequirementStatusesForControls).toHaveBeenCalledWith(
      workspace.db,
      "p1",
      ["c-manual"],
      expect.objectContaining({ writes: expect.any(Object) }),
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));

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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));

    const result = await clearRequirementExceptionAction(
      "req-3",
      emptyActionMessageState,
      new FormData(),
    );

    expect(result.message).toMatch(/Exception cleared/);
    expect(workspace.db.requirements[0]?.exception).toBeUndefined();
    expect(refreshRequirementStatusesForControls).toHaveBeenCalledWith(
      workspace.db,
      "p1",
      ["c1"],
      expect.objectContaining({ writes: expect.any(Object) }),
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
    withProjectWrite.mockImplementation(async (_scope, fn) => invokeProjectWriteMock(workspace, fn));

    const result = await clearRequirementExceptionAction(
      "req-no-ex",
      emptyActionMessageState,
      new FormData(),
    );
    expect(result.error).toMatch(/no exception/i);
  });
});
