import { describe, expect, it } from "vitest";
import type { Requirement } from "@complyloop/analysis-core/contract/project-types";
import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";
import { applyRequirementStatusRefresh } from "./assessment-status";
import { cloneProjectRows } from "./project-rows";

describe("applyRequirementStatusRefresh (scoped)", () => {
  const project = testProject({ id: "p1", orgId: "org-1" });

  it("refreshes using dismissed findings staged on rows", () => {
    const dismissed = testFinding({
      id: "f1",
      projectId: "p1",
      controlId: "ctl-img-alt",
      status: "dismissed",
    });
    const rows = cloneProjectRows([dismissed], [], [], "p1");

    applyRequirementStatusRefresh(rows, project, {
      controlIds: ["ctl-img-alt"],
    });

    const requirement = rows.requirements.find(
      (row) => row.controlId === "ctl-img-alt",
    );
    expect(requirement?.status).toBe("passed");
  });

  it("refreshes using requirement overrides staged on rows", () => {
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
    const rows = cloneProjectRows([open], [], [cleared], "p1");

    applyRequirementStatusRefresh(rows, project, {
      controlIds: ["ctl-img-alt"],
    });

    const requirement = rows.requirements.find((row) => row.id === "req-1");
    expect(requirement?.humanPass).toBeUndefined();
    expect(requirement?.status).toBe("failed");
    expect(requirement?.determination).toBe("automated");
  });

  it("no-ops when controlIds is empty", () => {
    const rows = cloneProjectRows([], [], [], "p1");
    applyRequirementStatusRefresh(rows, project, { controlIds: [] });
    expect(rows.requirements).toEqual([]);
    expect(rows.evidence).toEqual([]);
  });
});
