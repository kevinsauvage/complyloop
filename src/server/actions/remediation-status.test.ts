import "@/test-fixtures/register-action-workspace-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Requirement } from "@complyloop/analysis-core/contract/entities";

import { initialActionState } from "@/core/action-state";
import {
  clearProjectWritePayloads,
  mockProjectWrite,
  projectWritePayload,
} from "@/test-fixtures/action-workspace-mocks";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { testWorkspace } from "@/test-fixtures/workspace";

import { dismissFindingAction } from "./remediation";
import { clearRequirementExceptionAction } from "./requirements";

const assertRemediationRateLimit = vi.hoisted(() => vi.fn());
const assertRequirementsRateLimit = vi.hoisted(() => vi.fn());

vi.mock("../rate-limit", async () => {
  const actual =
    await vi.importActual<typeof import("../rate-limit")>("../rate-limit");
  return {
    ...actual,
    assertRemediationRateLimit: (...args: unknown[]) =>
      assertRemediationRateLimit(...args),
    assertRequirementsRateLimit: (...args: unknown[]) =>
      assertRequirementsRateLimit(...args),
  };
});

const project = testProject({ orgId: "org-1" });
const controlId = "ctl-img-alt";

/** Two open findings under one control; the requirement must reflect both. */
function workspaceWithTwoFindings(requirement: Partial<Requirement> = {}) {
  const base: Requirement = {
    id: "req-1",
    projectId: project.id,
    controlId,
    status: "failed",
    determination: "automated",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...requirement,
  };
  return testWorkspace({
    role: "member",
    project,
    findings: [
      testFinding({
        id: "f1",
        projectId: project.id,
        controlId,
        status: "open",
      }),
      testFinding({
        id: "f2",
        projectId: project.id,
        controlId,
        status: "open",
      }),
    ],
    remediations: [],
    db: { requirements: [base], alerts: [] },
  });
}

function refreshedRequirementStatus(): string | undefined {
  return projectWritePayload()?.requirements?.find(
    (candidate) => candidate.controlId === controlId,
  )?.status;
}

afterEach(() => {
  clearProjectWritePayloads();
  vi.clearAllMocks();
});

describe("targeted writes use the full finding set", () => {
  it("keeps the requirement failed when one of two open findings is dismissed", async () => {
    const workspace = workspaceWithTwoFindings({});
    mockProjectWrite(workspace);
    const form = new FormData();
    form.set("reason", "false_positive");
    form.set("note", "one occurrence is not real");

    const result = await dismissFindingAction("f1", initialActionState, form);

    expect(result.ok).toBe(true);
    expect(refreshedRequirementStatus()).toBe("failed");
  });

  it("returns the requirement to failed when a stale exception is cleared", async () => {
    const workspace = workspaceWithTwoFindings({
      status: "not_applicable",
      exception: {
        reason: "not_applicable",
        note: "looked inapplicable",
        at: "2026-01-02T00:00:00.000Z",
      },
    });
    mockProjectWrite(workspace);

    const result = await clearRequirementExceptionAction(
      "req-1",
      initialActionState,
      new FormData(),
    );

    expect(result.ok).toBe(true);
    expect(refreshedRequirementStatus()).toBe("failed");
  });
});
