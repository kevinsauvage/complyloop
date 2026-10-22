import "@/test-fixtures/register-action-workspace-mock";
import "@/test-fixtures/register-repo-mock";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { Requirement } from "@complyloop/analysis-core/contract/entities";

import { initialActionState } from "@/core/actions/action-state";
import {
  clearRecordedWrites,
  mockProjectTx,
  mockStore,
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
    // Admin: one fixture serves both triage (dismiss) and decision (clear
    // exception) writes; members may only triage.
    role: "admin",
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

/**
 * The requirement as it stands after the action: the refresh re-reads the
 * control's requirement + open findings from the (in-memory) store, so the
 * persisted row is the source of truth — a refresh that changes nothing writes
 * nothing.
 */
function refreshedRequirementStatus(): string | undefined {
  return mockStore()?.db.requirements.find(
    (candidate) => candidate.controlId === controlId,
  )?.status;
}

afterEach(() => {
  clearRecordedWrites();
  vi.clearAllMocks();
});

describe("targeted writes use the full finding set", () => {
  it("keeps the requirement failed when one of two open findings is dismissed", async () => {
    const workspace = workspaceWithTwoFindings({});
    mockProjectTx(workspace);
    const form = new FormData();
    form.set("reason", "false_positive");
    form.set("note", "one occurrence is not real");

    const result = await dismissFindingAction("f1", initialActionState, form);

    expect(result.ok).toBe(true);
    expect(refreshedRequirementStatus()).toBe("failed");
  });

  // Discriminating ordering test: the refresh must read the finding the same
  // transaction just dismissed. Deriving before the write would still see an
  // open finding and report "failed"; after the write it must leave "failed".
  it("derives the requirement from the row written by the same transaction", async () => {
    const workspace = workspaceWithTwoFindings({});
    workspace.db.findings = [
      testFinding({
        id: "f1",
        projectId: project.id,
        controlId,
        status: "open",
      }),
    ];
    mockProjectTx(workspace);
    const form = new FormData();
    form.set("reason", "false_positive");
    form.set("note", "not a real issue");

    const result = await dismissFindingAction("f1", initialActionState, form);

    expect(result.ok).toBe(true);
    expect(refreshedRequirementStatus()).toBe("unable_to_verify");
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
    mockProjectTx(workspace);

    const result = await clearRequirementExceptionAction(
      "req-1",
      initialActionState,
      new FormData(),
    );

    expect(result.ok).toBe(true);
    expect(refreshedRequirementStatus()).toBe("failed");
  });
});
