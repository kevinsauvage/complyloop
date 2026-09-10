"use server";

import type { CheckId } from "@complyloop/analysis-core/check-registry";
import { type Finding, type Remediation } from "@complyloop/db/types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  runtimeViolationStillPresent,
  scanRuntime,
} from "@complyloop/analysis-core/runtime/scan";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import { advanceRemediation, appendRemediationHistory } from "@/core/remediation";
import {
  entityIdSchema,
  optionalNoteSchema,
  parseForm,
  parseInput,
} from "@/core/boundary";
import { z } from "zod";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { sameInstance } from "../assessment-findings";
import { applyRequirementStatusRefresh } from "../assessment-status";
import type { Db } from "@complyloop/db/types";
import { remediationEvidenceDetail, remediationEvidenceSummary } from "../remediation-evidence";
import {
  getWorkspace,
  remediationForFinding,
  requireFinding,
  requireRemediationForFinding,
} from "../workspace";
import { withFindingWrite } from "../workspace-write";
import { appendEvidence, cloneProjectRows, upsertFindingInRows } from "../project-rows";
import {
  refresh,
  replaceRemediation,
  requireFindingContext,
} from "./shared";

const markImplementedInput = z.object({
  note: optionalNoteSchema,
});

const SOURCE_VERIFY_MESSAGE =
  "Source findings are verified by merging the draft pull request and re-assessing.";

/** Shown when automated re-check still finds the violation (role=alert). */
const STILL_FAILING_VERIFY_MESSAGE =
  "Still failing — the violation is still detected at this location.";

interface VerifyAuditFlags {
  runtimeRan: boolean;
  siteLevelChecksRan?: boolean;
  htmlValidateRan?: boolean;
}

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
  db: Db,
  live: Finding,
  remediation: Remediation,
  note: string,
  engine: "runtime" | "site",
  audit: VerifyAuditFlags,
): ProjectWritePayload {
  const project = db.projects.find(
    (candidate) => candidate.id === live.projectId,
  );
  if (!project) throw new PublicError("Unknown project.");

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
  previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  void previous;
  void formData;
  return runActionMessage(async () => {
    const findingId = parseInput(entityIdSchema, findingIdRaw);
    const preview = await getWorkspace();
    const finding = await requireFinding(findingId);
    const { project: previewProject } = requireFindingContext(preview, finding, "project.remediate");
    const previewRemediation = await requireRemediationForFinding(findingId);
    if (previewRemediation.status !== "implemented") {
      throw new PublicError("Verification requires status implemented.");
    }

    const location = finding.location;
    let present: boolean;
    let engine: "runtime" | "site";
    let note: string;
    let audit: VerifyAuditFlags;

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
    await withFindingWrite(findingId, "project.remediate", async ({ db, finding: live }) => {
      const remediation = remediationForFinding(db, findingId);
      const payload: ProjectWritePayload = {};
      if (present) {
        stillFailing = true;
        recordStillFailing(payload, remediation);
        return payload;
      }
      return markVerified(db, live, remediation, note, engine, audit);
    });
    refresh();
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
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    const findingId = parseInput(entityIdSchema, findingIdRaw);
    const { note: parsedNote } = parseForm(markImplementedInput, formData);
    await withFindingWrite(
      findingId,
      "project.remediate",
      async ({ db, finding }) => {
        const remediation = remediationForFinding(db, findingId);
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
    refresh();
    return "Marked as implemented.";
  });
}
