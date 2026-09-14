"use server";

import { z } from "zod";

import type { CheckAuditInput } from "@complyloop/analysis-core/check-authority";
import type { CheckId } from "@complyloop/analysis-core/check-registry";
import {
  type Finding,
  type Remediation,
} from "@complyloop/analysis-core/contract/entities";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  runtimeViolationStillPresent,
  scanRuntime,
} from "@complyloop/analysis-core/runtime/scan";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import type { WorkspaceSlice } from "@complyloop/db/types";

import {
  advanceRemediation,
  appendRemediationHistory,
} from "@/core/remediation-lifecycle";
import { optionalNoteSchema, parseEntityId, parseForm } from "@/core/validate";

import { type ActionState, runAction } from "../action-state";
import { sameInstance } from "../assessment/assessment-findings";
import { applyRequirementStatusRefresh } from "../assessment/assessment-status";
import {
  remediationEvidenceDetail,
  remediationEvidenceSummary,
} from "../assessment/remediation-evidence";
import {
  appendEvidence,
  cloneProjectRows,
  upsertFindingInRows,
} from "../workspace/project-rows";
import {
  getWorkspace,
  remediationForFinding,
  requireFinding,
  requireRemediationForFinding,
} from "../workspace/workspace";
import { withFindingWrite } from "../workspace/workspace-write";
import { COMPLIANCE_LOOP_ROUTES } from "./refresh-routes";
import { refresh, replaceRemediation, requireFindingContext } from "./shared";

const markImplementedInput = z.object({
  note: optionalNoteSchema,
});

const SOURCE_VERIFY_MESSAGE =
  "Source findings are verified by merging the draft pull request and re-assessing.";

/** Shown when automated re-check still finds the violation (role=alert). */
const STILL_FAILING_VERIFY_MESSAGE =
  "Still failing — the violation is still detected at this location.";

const VERIFY_REQUIRES_IMPLEMENTED_MESSAGE =
  "Verification requires status implemented.";

const IMPLEMENT_REQUIRES_APPROVED_MESSAGE =
  "Marking implemented requires status approved.";

function recordStillFailing(
  payload: ProjectWritePayload,
  remediation: Remediation,
): void {
  replaceRemediation(
    payload,
    appendRemediationHistory(
      remediation,
      remediation.status,
      "Verification failed: the violation is still detected on the page.",
    ),
  );
}

function markVerified(
  db: WorkspaceSlice,
  live: Finding,
  remediation: Remediation,
  note: string,
  engine: "runtime" | "site",
  audit: CheckAuditInput,
): ProjectWritePayload {
  const project = db.projects.find(
    (candidate) => candidate.id === live.projectId,
  );
  if (!project) throw new PublicError("Unknown project.");

  // Re-check inside the write lock: a concurrent write may have advanced the
  // remediation between the preview load and this transaction.
  if (remediation.status !== "implemented") {
    throw new PublicError(VERIFY_REQUIRES_IMPLEMENTED_MESSAGE);
  }

  const rows = cloneProjectRows(
    db.findings,
    db.remediations,
    db.requirements,
    project.id,
  );
  const verifiedRemediation = advanceRemediation(remediation, "verified", note);
  const updatedFinding: Finding = {
    ...live,
    status: "resolved",
    resolvedNote: "Fix verified by re-running the runtime audit.",
  };
  upsertFindingInRows(rows, updatedFinding);
  appendEvidence(rows, {
    kind: "remediation_verified",
    summary: remediationEvidenceSummary("verified", live),
    projectId: live.projectId,
    controlId: live.controlId,
    findingId: live.id,
    detail: remediationEvidenceDetail({ engine }),
  });
  applyRequirementStatusRefresh(rows, project, {
    controlIds: [live.controlId],
    runtimeRan: audit.runtimeRan,
    siteLevelChecksRan: audit.siteLevelChecksRan,
    htmlValidateRan: audit.htmlValidateRan,
  });
  const payload: ProjectWritePayload = {
    findings: [updatedFinding],
    requirements: rows.requirements,
    evidence: rows.evidence,
  };
  replaceRemediation(payload, verifiedRemediation);
  return payload;
}

export async function verifyRemediationAction(
  findingIdRaw: string,
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  void previous;
  void formData;
  return runAction(async () => {
    const findingId = parseEntityId(findingIdRaw);
    const preview = await getWorkspace();
    const finding = await requireFinding(findingId);
    const { project: previewProject } = requireFindingContext(
      preview,
      finding,
      "project.remediate",
    );
    const previewRemediation = await requireRemediationForFinding(findingId);
    if (previewRemediation.status !== "implemented") {
      throw new PublicError(VERIFY_REQUIRES_IMPLEMENTED_MESSAGE);
    }

    const location = finding.location;
    let present: boolean;
    let engine: "runtime" | "site";
    let note: string;
    let audit: CheckAuditInput;

    switch (location.kind) {
      case "source":
        throw new PublicError(SOURCE_VERIFY_MESSAGE);
      case "dom": {
        present = await runtimeViolationStillPresent({
          checkId: finding.checkId as CheckId,
          location,
        });
        engine = "runtime";
        note = "Runtime re-audit found no remaining violation on the page";
        audit = { runtimeRan: true };
        break;
      }
      case "site": {
        const project = previewProject;
        const result = await scanRuntime({
          runtimeBaseUrl: project.runtimeBaseUrl,
          runtimeRoutes: project.runtimeRoutes,
        });
        present =
          Boolean(result.error) ||
          result.pagesScanned === 0 ||
          result.siteLevelChecksRan !== true ||
          result.findings.some((raw) => sameInstance(finding, raw));
        engine = "site";
        note = "Runtime re-audit found no remaining site-level violation";
        audit = {
          runtimeRan: true,
          siteLevelChecksRan: result.siteLevelChecksRan,
          htmlValidateRan: result.htmlValidateRan,
        };
        break;
      }
      default: {
        const _exhaustive: never = location;
        throw new Error(`Unhandled finding location: ${String(_exhaustive)}`);
      }
    }

    let stillFailing = false;
    await withFindingWrite(
      findingId,
      "project.remediate",
      async ({ db, finding: live }) => {
        const remediation = remediationForFinding(db, findingId);
        const payload: ProjectWritePayload = {};
        if (present) {
          stillFailing = true;
          recordStillFailing(payload, remediation);
          return payload;
        }
        return markVerified(db, live, remediation, note, engine, audit);
      },
    );
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return stillFailing
      ? STILL_FAILING_VERIFY_MESSAGE
      : "Fix verified by automated re-check.";
  });
}

/**
 * Marks an approved remediation as implemented when the engineer applied the
 * change outside ComplyLoop (or there is no automatable fix).
 */
export async function markRemediationImplementedAction(
  findingIdRaw: string,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const findingId = parseEntityId(findingIdRaw);
    const { note: parsedNote } = parseForm(markImplementedInput, formData);
    await withFindingWrite(
      findingId,
      "project.remediate",
      async ({ db, finding }) => {
        const remediation = remediationForFinding(db, findingId);
        if (remediation.status !== "approved") {
          throw new PublicError(IMPLEMENT_REQUIRES_APPROVED_MESSAGE);
        }
        const note =
          parsedNote ??
          "Marked implemented by user (applied outside the platform)";
        const payload: ProjectWritePayload = {};

        replaceRemediation(
          payload,
          advanceRemediation(remediation, "implemented", note),
        );
        appendEvidence(payload, {
          kind: "remediation_implemented",
          summary: remediationEvidenceSummary("implemented", finding),
          projectId: finding.projectId,
          controlId: finding.controlId,
          findingId: finding.id,
          detail: remediationEvidenceDetail({ manual: true, note }),
        });
        return payload;
      },
    );
    refresh(...COMPLIANCE_LOOP_ROUTES);
    return "Marked as implemented.";
  });
}
