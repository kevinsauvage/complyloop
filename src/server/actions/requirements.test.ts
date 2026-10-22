import "@/test-fixtures/register-action-workspace-mock";
import "@/test-fixtures/register-repo-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Requirement } from "@complyloop/analysis-core/contract/entities";
import type { WorkspaceSlice } from "@complyloop/db/types";

import { initialActionState } from "@/core/actions/action-state";
import {
  clearRecordedWrites,
  mockProjectTx,
  recordedWrites,
} from "@/test-fixtures/action-workspace-mocks";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testRemediation } from "@/test-fixtures/remediation";
import { type TestWorkspace, testWorkspace } from "@/test-fixtures/workspace";

import {
  clearRequirementExceptionAction,
  clearRequirementHumanPassAction,
  markRequirementExceptionAction,
  markRequirementPassedAction,
} from "./requirements";

const refreshRequirementsForControls = vi.hoisted(() =>
  vi.fn(async (...args: unknown[]) => {
    void args;
    return { requirements: [], evidence: [] };
  }),
);
const assertRequirementsRateLimit = vi.hoisted(() => vi.fn());

vi.mock("../rate-limit", async () => {
  const actual =
    await vi.importActual<typeof import("../rate-limit")>("../rate-limit");
  return {
    ...actual,
    assertRequirementsRateLimit: (...args: unknown[]) =>
      assertRequirementsRateLimit(...args),
  };
});

vi.mock("../observability", () => ({
  reportError: vi.fn(),
  reportWarning: vi.fn(),
  reportAppError: vi.fn(),
}));

vi.mock("../assessment/assessment-status", async () => {
  const actual = await vi.importActual<
    typeof import("../assessment/assessment-status")
  >("../assessment/assessment-status");
  return {
    ...actual,
    refreshRequirementsForControls: (
      ...args: Parameters<typeof actual.refreshRequirementsForControls>
    ) => refreshRequirementsForControls(...args),
  };
});

const project = testProject({ orgId: "org-1" });
const finding = testFinding();

function baseWorkspace(
  overrides: Partial<WorkspaceSlice> = {},
  role: "member" | "admin" = "admin",
): TestWorkspace {
  const { findings, remediations, ...rest } = overrides;
  return testWorkspace({
    role,
    userId: "user-1",
    project,
    findings: findings ?? [finding],
    remediations: remediations ?? [
      testRemediation({ status: "implemented", suggestion: null, history: [] }),
    ],
    db: {
      requirements: [],
      alerts: [],
      ...rest,
    },
  });
}

function requirementWorkspace(requirement: Requirement): TestWorkspace {
  return baseWorkspace({
    requirements: [requirement],
    findings: [],
    remediations: [],
  });
}

afterEach(() => {
  clearRecordedWrites();
  vi.clearAllMocks();
});

describe("requirement decision actions", () => {
  it("refuses exceptions from a member (compliance decisions are admin/owner)", async () => {
    const requirement: Requirement = {
      id: "req-1",
      projectId: "p1",
      controlId: "ctl-img-alt",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockProjectTx(
      baseWorkspace(
        { requirements: [requirement], findings: [], remediations: [] },
        "member",
      ),
    );
    const form = new FormData();
    form.set("reason", "accepted_risk");
    form.set("note", "Risk noted");

    const result = await markRequirementExceptionAction(
      "req-1",
      initialActionState,
      form,
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/project\.decide/);
    expect(recordedWrites()?.requirements ?? []).toEqual([]);
  });

  it("records a not-applicable exception", async () => {
    const requirement: Requirement = {
      id: "req-1",
      projectId: "p1",
      controlId: "ctl-img-alt",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    mockProjectTx(workspace);

    const form = new FormData();
    form.set("reason", "not_applicable");
    form.set("note", "Out of scope for this surface");

    const result = await markRequirementExceptionAction(
      "req-1",
      initialActionState,
      form,
    );

    expect(result.message).toMatch(/Exception recorded/);
    expect(recordedWrites()?.requirements?.[0]?.status).toBe("not_applicable");
    expect(recordedWrites()?.requirements?.[0]?.exception?.reason).toBe(
      "not_applicable",
    );
  });

  it("records a temporary exception with expiry", async () => {
    const requirement: Requirement = {
      id: "req-temp",
      projectId: "p1",
      controlId: "ctl-img-alt",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    mockProjectTx(workspace);

    const form = new FormData();
    form.set("reason", "temporary");
    form.set("note", "Fix landing next sprint");
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    form.set("expiresAt", expiryDate);

    const result = await markRequirementExceptionAction(
      "req-temp",
      initialActionState,
      form,
    );

    expect(result.message).toBe("Exception recorded.");
    expect(assertRequirementsRateLimit).toHaveBeenCalled();
    expect(recordedWrites()?.requirements?.[0]?.status).toBe("failed");
    expect(recordedWrites()?.requirements?.[0]?.exception?.expiresAt).toMatch(
      new RegExp(`^${expiryDate}`),
    );
  });

  it("requires expiry for temporary exceptions", async () => {
    const requirement: Requirement = {
      id: "req-temp-2",
      projectId: "p1",
      controlId: "ctl-img-alt",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    mockProjectTx(workspace);

    const form = new FormData();
    form.set("reason", "temporary");
    form.set("note", "needs date");

    const result = await markRequirementExceptionAction(
      "req-temp-2",
      initialActionState,
      form,
    );
    expect(result.ok ? null : result.message).toMatch(/expiry date/i);
  });

  it("requires a note for exceptions", async () => {
    const requirement: Requirement = {
      id: "req-note",
      projectId: "p1",
      controlId: "ctl-img-alt",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    mockProjectTx(workspace);

    const form = new FormData();
    form.set("reason", "accepted_risk");

    const result = await markRequirementExceptionAction(
      "req-note",
      initialActionState,
      form,
    );
    expect(result.ok ? null : result.message).toMatch(/note is required/i);
  });

  it("marks a manual control as human-passed", async () => {
    const requirement: Requirement = {
      id: "req-2",
      projectId: "p1",
      controlId: "ctl-outline-none",
      status: "unable_to_verify",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    mockProjectTx(workspace);

    const form = new FormData();
    form.set("note", "Reviewed in staging");

    const result = await markRequirementPassedAction(
      "req-2",
      initialActionState,
      form,
    );

    expect(result.message).toMatch(/Human pass/);
    expect(recordedWrites()?.requirements?.[0]?.status).toBe("passed");
    expect(recordedWrites()?.requirements?.[0]?.humanPass?.note).toMatch(
      /staging/,
    );
  });

  it("rejects human pass on automated controls", async () => {
    const requirement: Requirement = {
      id: "req-auto",
      projectId: "p1",
      controlId: "ctl-img-alt",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    mockProjectTx(workspace);

    const form = new FormData();
    form.set("note", "should not work");

    const result = await markRequirementPassedAction(
      "req-auto",
      initialActionState,
      form,
    );
    expect(result.ok ? null : result.message).toMatch(/Only manual controls/);
  });

  it("clears a human pass and refreshes status", async () => {
    const requirement: Requirement = {
      id: "req-pass",
      projectId: "p1",
      controlId: "ctl-outline-none",
      status: "passed",
      determination: "human_review",
      updatedAt: "2026-01-01T00:00:00.000Z",
      humanPass: {
        note: "ok",
        at: "2026-01-01T00:00:00.000Z",
      },
    };
    const workspace = requirementWorkspace(requirement);
    mockProjectTx(workspace);

    const result = await clearRequirementHumanPassAction(
      "req-pass",
      initialActionState,
      new FormData(),
    );

    expect(result.message).toBe("Human pass cleared.");
    expect(recordedWrites()?.requirements?.[0]?.humanPass).toBeUndefined();
    expect(refreshRequirementsForControls).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "p1" }),
      ["ctl-outline-none"],
    );
  });

  it("errors when clearing a missing human pass", async () => {
    const requirement: Requirement = {
      id: "req-no-pass",
      projectId: "p1",
      controlId: "ctl-outline-none",
      status: "unable_to_verify",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    mockProjectTx(workspace);

    const result = await clearRequirementHumanPassAction(
      "req-no-pass",
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(/no human pass/i);
  });

  it("clears an exception and refreshes status", async () => {
    const requirement: Requirement = {
      id: "req-3",
      projectId: "p1",
      controlId: "ctl-img-alt",
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
    mockProjectTx(workspace);

    const result = await clearRequirementExceptionAction(
      "req-3",
      initialActionState,
      new FormData(),
    );

    expect(result.message).toMatch(/Exception cleared/);
    expect(recordedWrites()?.requirements?.[0]?.exception).toBeUndefined();
    expect(refreshRequirementsForControls).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "p1" }),
      ["ctl-img-alt"],
    );
  });

  it("errors when clearing a missing exception", async () => {
    const requirement: Requirement = {
      id: "req-no-ex",
      projectId: "p1",
      controlId: "ctl-img-alt",
      status: "failed",
      determination: "automated",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const workspace = requirementWorkspace(requirement);
    mockProjectTx(workspace);

    const result = await clearRequirementExceptionAction(
      "req-no-ex",
      initialActionState,
      new FormData(),
    );
    expect(result.ok ? null : result.message).toMatch(/no exception/i);
  });
});
