import { describe, expect, it } from "vitest";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { applyEntityWrite } from "./assessment-status";

describe("applyEntityWrite", () => {
  const project = testProject({ id: "p1", orgId: "org-1" });

  it("refreshes using dismissed findings staged on the payload", () => {
    const open = testFinding({
      id: "f1",
      projectId: "p1",
      controlId: "ctl-img-alt",
      status: "open",
    });
    const dismissed = { ...open, status: "dismissed" as const };
    const payload: ProjectWritePayload = {
      findings: [dismissed],
    };

    applyEntityWrite(payload, {
      project,
      findings: [open],
      requirements: [],
      controlIds: ["ctl-img-alt"],
    });

    const requirement = payload.requirements?.find(
      (row) => row.controlId === "ctl-img-alt",
    );
    expect(requirement?.status).toBe("passed");
  });

  it("refreshes using requirement overrides staged on the payload", () => {
    const sticky: Requirement = {
      id: "req-1",
      projectId: "p1",
      controlId: "ctl-img-alt",
      status: "passed",
      determination: "human_review",
      updatedAt: "2026-01-01T00:00:00.000Z",
      humanPass: {
        note: "looks fine",
        at: "2026-01-01T00:00:00.000Z",
      },
    };
    const cleared: Requirement = {
      id: "req-1",
      projectId: "p1",
      controlId: "ctl-img-alt",
      status: "passed",
      determination: "automated",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    const open = testFinding({
      id: "f1",
      projectId: "p1",
      controlId: "ctl-img-alt",
      status: "open",
    });
    const payload: ProjectWritePayload = {
      requirements: [cleared],
    };

    applyEntityWrite(payload, {
      project,
      findings: [open],
      requirements: [sticky],
      controlIds: ["ctl-img-alt"],
    });

    const requirement = payload.requirements?.find((row) => row.id === "req-1");
    expect(requirement?.humanPass).toBeUndefined();
    expect(requirement?.status).toBe("failed");
    expect(requirement?.determination).toBe("automated");
  });

  it("no-ops when controlIds is empty", () => {
    const payload: ProjectWritePayload = {};
    applyEntityWrite(payload, {
      project,
      findings: [],
      requirements: [],
      controlIds: [],
    });
    expect(payload.requirements).toBeUndefined();
    expect(payload.evidence).toBeUndefined();
  });
});
