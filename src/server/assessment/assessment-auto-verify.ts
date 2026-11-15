import "server-only";

import fs from "node:fs";

import { type Finding } from "@complyloop/analysis-core/contract/entities";
import { isSourceLocation } from "@complyloop/analysis-core/contract/location";
import { resolveInside } from "@complyloop/analysis-core/workspace-path";

import { advanceRemediation } from "@/core/requirements/remediation-lifecycle";

import { reportWarning } from "../observability";
import type { ProjectRows } from "../workspace/project-rows";
import { appendEvidence } from "../workspace/project-rows";
import {
  remediationEvidenceDetail,
  remediationEvidenceSummary,
} from "./remediation-evidence";

export interface ResolveVerifyScope {
  /**
   * Files this run re-scanned (`null` after a full-tree scan). A resolve only
   * counts as fix-confirmed when the finding's file is among them.
   */
  scopedFileSet: Set<string> | null;
  /** True when sources were reused without any scan — nothing was re-checked. */
  sourcesUnchanged: boolean;
  /** Checkout the run scanned — backs the deletion proof below. */
  rootPath: string;
  /**
   * True when a runtime audit superseded this check's AST findings. The source
   * resolve is then a merge artifact, not a confirmed fix: only the runtime
   * re-audit path may verify those checks.
   */
  runtimeOwnsCheck?: boolean;
  /** Test seam for the checkout existence check. */
  fileExists?: (filePath: string) => boolean;
}

function fileExistsInCheckout(rootPath: string, filePath: string): boolean {
  try {
    return fs.existsSync(resolveInside(rootPath, filePath));
  } catch {
    return false;
  }
}

/**
 * Auto-verifies a remediation whose finding resolved with positive proof (see
 * below). Exported for unit tests of the re-scan scope guard.
 *
 * Applies to any `approved` or `implemented` remediation regardless of how it
 * was approved (draft PR, bulk approve, manual approve): the proof strength
 * is identical — the violation is gone from a re-scanned file with no
 * same-file sibling — so only PR-flow approvals verifying would leave every
 * other approval stuck short of `verified` forever.
 */
export function verifyRemediationOnResolve(
  rows: ProjectRows,
  finding: Finding,
  assessmentId: string,
  scope: ResolveVerifyScope,
): void {
  if (!isSourceLocation(finding.location)) return;
  // A runtime audit owns these check ids at merge time (AST findings for them
  // are dropped). Resolving a source finding because the merge dropped it is
  // not proof the defect is fixed — a runtime re-audit is the only verifier.
  if (scope.runtimeOwnsCheck === true) {
    reportWarning("Skipping auto-verify: runtime authority owns this check", {
      code: "draft_pr_verify_runtime_owned",
      projectId: finding.projectId,
      findingId: finding.id,
      assessmentId,
      checkId: finding.checkId,
    });
    return;
  }
  const remediationIndex = rows.remediations.findIndex(
    (candidate) => candidate.findingId === finding.id,
  );
  const remediation = rows.remediations[remediationIndex];
  if (
    !remediation ||
    (remediation.status !== "approved" && remediation.status !== "implemented")
  ) {
    return;
  }

  // A reconcile resolve is only a confirmed fix when the finding's location
  // was actually re-scanned this run: full scans re-check the whole tree,
  // scoped scans must include the finding's file. Otherwise the resolve may
  // come from an identity mismatch — skip auto-verify instead of advancing.
  if (scope.sourcesUnchanged) {
    reportWarning(
      "Skipping auto-verify: sources unchanged, finding was not re-scanned",
      {
        code: "draft_pr_verify_scope_unproven",
        projectId: finding.projectId,
        findingId: finding.id,
        assessmentId,
      },
    );
    return;
  }
  if (
    scope.scopedFileSet !== null &&
    !scope.scopedFileSet.has(finding.location.filePath)
  ) {
    reportWarning(
      "Skipping auto-verify: finding file outside the re-scanned scope",
      {
        code: "draft_pr_verify_scope_unproven",
        projectId: finding.projectId,
        findingId: finding.id,
        assessmentId,
        filePath: finding.location.filePath,
      },
    );
    return;
  }

  // Positive proof, not just absence. A resolve alone cannot verify: the file
  // may have been deleted/renamed (resolves everything it contained) or the
  // code may have changed shape (e.g. reformat — the violation persists under
  // a new snippet next to the resolve). Both fail closed below. Note
  // `assessmentId` is write-once, so the sibling check below marks exactly
  // the rows created or re-detected in this run — not merely matched ones.
  const filePath = finding.location.filePath;
  const exists = scope.fileExists
    ? scope.fileExists(filePath)
    : fileExistsInCheckout(scope.rootPath, filePath);
  if (!exists) {
    reportWarning("Skipping auto-verify: finding file no longer exists", {
      code: "draft_pr_verify_scope_unproven",
      projectId: finding.projectId,
      findingId: finding.id,
      assessmentId,
      filePath,
    });
    return;
  }
  const siblingPersists = rows.findings.some(
    (candidate) =>
      candidate.id !== finding.id &&
      candidate.controlId === finding.controlId &&
      candidate.status === "open" &&
      candidate.assessmentId === assessmentId &&
      isSourceLocation(candidate.location) &&
      candidate.location.filePath === filePath,
  );
  if (siblingPersists) {
    reportWarning(
      "Skipping auto-verify: same-file finding persists after re-scan",
      {
        code: "draft_pr_verify_scope_unproven",
        projectId: finding.projectId,
        findingId: finding.id,
        assessmentId,
        filePath,
      },
    );
    return;
  }

  // `approved` advances through `implemented` (the fix landed outside the
  // tracked PR flow — the resolve with proof above is the implementation
  // evidence); `implemented` advances straight to `verified`.
  const wasApproved = remediation.status === "approved";
  const implemented = wasApproved
    ? advanceRemediation(remediation, "implemented")
    : remediation;
  const verified = advanceRemediation(implemented, "verified");
  rows.remediations[remediationIndex] = verified;
  const detail = remediationEvidenceDetail({
    determination: "automated",
    method: "deterministic_reassessment",
    note: wasApproved
      ? "No longer detected by deterministic reassessment after approval"
      : "Verified by deterministic reassessment",
  });
  if (wasApproved) {
    appendEvidence(rows, {
      kind: "remediation_implemented",
      summary: remediationEvidenceSummary("implemented", finding),
      projectId: finding.projectId,
      controlId: finding.controlId,
      findingId: finding.id,
      assessmentId,
      detail,
    });
  }
  appendEvidence(rows, {
    kind: "remediation_verified",
    summary: remediationEvidenceSummary("verified", finding),
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    assessmentId,
    detail,
  });
}
