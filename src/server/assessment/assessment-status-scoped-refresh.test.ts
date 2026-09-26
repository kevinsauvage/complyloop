import { describe, expect, it } from "vitest";

import type { Requirement } from "@complyloop/analysis-core/contract/entities";

import { testFinding } from "@/test-fixtures/finding";
import { testProject } from "@/test-fixtures/project";

import { cloneProjectRows } from "../workspace/project-rows";
import { applyRequirementStatusRefresh } from "./assessment-status";

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
    // A human dismiss with no scan context must not become an
    // automated pass.
    expect(requirement?.status).toBe("unable_to_verify");
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

  describe("sticky human decisions", () => {
    const stickyPass: Requirement = {
      id: "req-1",
      projectId: "p1",
      controlId: "ctl-img-alt",
      status: "passed",
      determination: "human_review",
      updatedAt: "2026-03-01T12:00:00.000Z",
      exception: {
        reason: "accepted_risk",
        note: "Legacy banner, tracked separately",
        at: "2026-03-01T12:00:00.000Z",
      },
    };

    it("holds against violations detected before the decision", () => {
      const covered = testFinding({
        id: "f-old",
        projectId: "p1",
        controlId: "ctl-img-alt",
        detectedAt: "2026-02-01T00:00:00.000Z",
      });
      const rows = cloneProjectRows([covered], [], [stickyPass], "p1");

      applyRequirementStatusRefresh(rows, project, {
        controlIds: ["ctl-img-alt"],
        filesScanned: 3,
      });

      const requirement = rows.requirements.find((row) => row.id === "req-1");
      expect(requirement?.status).toBe("passed");
      expect(requirement?.exception?.note).toBe(
        "Legacy banner, tracked separately",
      );
      expect(rows.evidence).toEqual([]);
    });

    it("re-opens on a violation detected after the decision", () => {
      const regression = testFinding({
        id: "f-new",
        projectId: "p1",
        controlId: "ctl-img-alt",
        detectedAt: "2026-03-05T00:00:00.000Z",
      });
      const rows = cloneProjectRows([regression], [], [stickyPass], "p1");

      applyRequirementStatusRefresh(rows, project, {
        controlIds: ["ctl-img-alt"],
        filesScanned: 3,
      });

      const requirement = rows.requirements.find((row) => row.id === "req-1");
      expect(requirement?.status).toBe("failed");
      expect(requirement?.determination).toBe("automated");
      expect(requirement?.exception).toBeUndefined();

      const cleared = rows.evidence.find(
        (record) => record.kind === "requirement_exception_cleared",
      );
      expect(cleared?.detail).toMatchObject({
        reopened: true,
        previousException: stickyPass.exception,
        newViolationFindingIds: ["f-new"],
      });
      expect(
        rows.evidence.some(
          (record) =>
            record.kind === "requirement_status_changed" &&
            record.detail?.regression === true,
        ),
      ).toBe(true);
    });

    it("re-opens a human pass the same way", () => {
      const humanPass: Requirement = {
        ...stickyPass,
        exception: undefined,
        humanPass: { note: "Audited", at: "2026-03-01T12:00:00.000Z" },
      };
      delete humanPass.exception;
      const regression = testFinding({
        id: "f-new",
        projectId: "p1",
        controlId: "ctl-img-alt",
        detectedAt: "2026-03-05T00:00:00.000Z",
      });
      const rows = cloneProjectRows([regression], [], [humanPass], "p1");

      applyRequirementStatusRefresh(rows, project, {
        controlIds: ["ctl-img-alt"],
        filesScanned: 3,
      });

      const requirement = rows.requirements.find((row) => row.id === "req-1");
      expect(requirement?.status).toBe("failed");
      expect(requirement?.humanPass).toBeUndefined();
      expect(
        rows.evidence.some(
          (record) => record.kind === "requirement_human_pass_cleared",
        ),
      ).toBe(true);
    });

    it("holds when only warnings appear after the decision", () => {
      const warning = testFinding({
        id: "f-warn",
        projectId: "p1",
        controlId: "ctl-img-alt",
        kind: "warning",
        detectedAt: "2026-03-05T00:00:00.000Z",
      });
      const rows = cloneProjectRows([warning], [], [stickyPass], "p1");

      applyRequirementStatusRefresh(rows, project, {
        controlIds: ["ctl-img-alt"],
        filesScanned: 3,
      });

      expect(rows.requirements.find((row) => row.id === "req-1")?.status).toBe(
        "passed",
      );
    });
  });

  it("no-ops when controlIds is empty", () => {
    const rows = cloneProjectRows([], [], [], "p1");
    applyRequirementStatusRefresh(rows, project, { controlIds: [] });
    expect(rows.requirements).toEqual([]);
    expect(rows.evidence).toEqual([]);
  });
});
