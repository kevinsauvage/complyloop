import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Requirement } from "@complyloop/analysis-core/contract/entities";
import type { WorkspaceSlice } from "@complyloop/db/types";

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
import type { Workspace } from "../workspace/workspace";
import {
  clearRequirementExceptionAction,
  clearRequirementHumanPassAction,
  markRequirementExceptionAction,
  markRequirementPassedAction,
} from "./requirements";

const applyRequirementStatusRefresh = vi.hoisted(() => vi.fn());

vi.mock("../observability", () => ({
  reportError: vi.fn(),
  reportWarning: vi.fn(),
  reportDebug: vi.fn(),
  reportInfo: vi.fn(),
  reportAppError: vi.fn(),
}));

vi.mock("../assessment/assessment-status", async () => {
  const actual = await vi.importActual<typeof import("../assessment/assessment-status")>(
    "../assessment/assessment-status",
  );
  return {
    ...actual,
    applyRequirementStatusRefresh: (...args: unknown[]) => applyRequirementStatusRefresh(...args),
  };
});

const project = testProject({ orgId: "org-1" });
const finding = testFinding();

function baseWorkspace(overrides: Partial<WorkspaceSlice> = {}): Workspace {
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
      requirements: [],
      alerts: [],
      ...rest,
    },
  });
}

function requirementWorkspace(requirement: Requirement): Workspace {
  return baseWorkspace({
    requirements: [requirement],
    findings: [],
    remediations: [],
  });
}

afterEach(() => {
  clearProjectWritePayloads();
  vi.clearAllMocks();
});

describe("requirement decision actions", () => {
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
    mockProjectWrite(workspace);

    const form = new FormData();
    form.set("reason", "not_applicable");
    form.set("note", "Out of scope for this surface");

    const result = await markRequirementExceptionAction(
      "req-1",
      initialActionState,
      form,
    );

    expect(result.message).toMatch(/Exception recorded/);
    expect(projectWritePayload()?.requirements?.[0]?.status).toBe("not_applicable");
    expect(projectWritePayload()?.requirements?.[0]?.exception?.reason).toBe(
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
    mockProjectWrite(workspace);

    const form = new FormData();
    form.set("reason", "temporary");
    form.set("note", "Fix landing next sprint");
    form.set("expiresAt", "2026-12-31");

    const result = await markRequirementExceptionAction(
      "req-temp",
      initialActionState,
      form,
    );

    expect(result.message).toBe("Exception recorded.");
    expect(projectWritePayload()?.requirements?.[0]?.status).toBe("failed");
    expect(projectWritePayload()?.requirements?.[0]?.exception?.expiresAt).toMatch(
      /^2026-12-31/,
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
    mockProjectWrite(workspace);

    const form = new FormData();
    form.set("reason", "temporary");
    form.set("note", "needs date");

    const result = await markRequirementExceptionAction(
      "req-temp-2",
      initialActionState,
      form,
    );
    expect((result.ok ? null : result.message)).toMatch(/expiry date/i);
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
    mockProjectWrite(workspace);

    const form = new FormData();
    form.set("reason", "accepted_risk");

    const result = await markRequirementExceptionAction(
      "req-note",
      initialActionState,
      form,
    );
    expect((result.ok ? null : result.message)).toMatch(/note is required/i);
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
    mockProjectWrite(workspace);

    const form = new FormData();
    form.set("note", "Reviewed in staging");

    const result = await markRequirementPassedAction(
      "req-2",
      initialActionState,
      form,
    );

    expect(result.message).toMatch(/Human pass/);
    expect(projectWritePayload()?.requirements?.[0]?.status).toBe("passed");
    expect(projectWritePayload()?.requirements?.[0]?.humanPass?.note).toMatch(/staging/);
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
    mockProjectWrite(workspace);

    const form = new FormData();
    form.set("note", "should not work");

    const result = await markRequirementPassedAction(
      "req-auto",
      initialActionState,
      form,
    );
    expect((result.ok ? null : result.message)).toMatch(/Only manual controls/);
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
    mockProjectWrite(workspace);

    const result = await clearRequirementHumanPassAction(
      "req-pass",
      initialActionState,
      new FormData(),
    );

    expect(result.message).toBe("Human pass cleared.");
    expect(projectWritePayload()?.requirements?.[0]?.humanPass).toBeUndefined();
    expect(applyRequirementStatusRefresh).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ id: "p1" }),
      expect.objectContaining({ controlIds: ["ctl-outline-none"] }),
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
    mockProjectWrite(workspace);

    const result = await clearRequirementHumanPassAction(
      "req-no-pass",
      initialActionState,
      new FormData(),
    );
    expect((result.ok ? null : result.message)).toMatch(/no human pass/i);
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
    mockProjectWrite(workspace);

    const result = await clearRequirementExceptionAction(
      "req-3",
      initialActionState,
      new FormData(),
    );

    expect(result.message).toMatch(/Exception cleared/);
    expect(projectWritePayload()?.requirements?.[0]?.exception).toBeUndefined();
    expect(applyRequirementStatusRefresh).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ id: "p1" }),
      expect.objectContaining({ controlIds: ["ctl-img-alt"] }),
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
    mockProjectWrite(workspace);

    const result = await clearRequirementExceptionAction(
      "req-no-ex",
      initialActionState,
      new FormData(),
    );
    expect((result.ok ? null : result.message)).toMatch(/no exception/i);
  });
});