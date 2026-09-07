"use server";

import type { CheckId } from "@complyloop/analysis-core/types";
import { PublicError, type Finding, type Remediation } from "@complyloop/db/types";
import {
  runtimeViolationStillPresent,
  scanRuntime,
} from "@complyloop/analysis-core/runtime/scan";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import { advanceRemediation } from "@/core/remediation";
import { entityIdSchema, optionalNoteSchema } from "@/core/boundary";
import { z } from "zod";
import {
  actionErrorState,
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseForm, parseInput } from "../boundary";
import { sameInstance } from "../assessment-findings";
import {
  findingsWithPayloadOverrides,
  mergeRefreshIntoPayload,
  refreshRequirementStatusesForControls,
} from "../assessment-status";
import type { Db } from "../db";
import {
  findingById,
  getWorkspace,
  remediationForFinding,
} from "../workspace";
import { withProjectWrite } from "../workspace-write";
import {
  evidenceEntry,
  refresh,
  replaceRemediation,
  requireOnFindingProject,
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
  const updated: Remediation = {
    ...remediation,
    history: [
      ...remediation.history,
      {
        status: remediation.status,
        at: new Date().toISOString(),
        note: "Verification failed: the violation is still detected on the page.",
      },
    ],
  };
  payload.remediations = [...(payload.remediations ?? []), updated];
}

function markVerified(
  db: Db,
  payload: ProjectWritePayload,
  live: Finding,
  remediation: Remediation,
  note: string,
  engine: "runtime" | "site",
  audit: VerifyAuditFlags,
): void {
  const project = db.projects.find(
    (candidate) => candidate.id === live.projectId,
  );
  if (!project) throw new PublicError("Unknown project.");

  replaceRemediation(
    payload,
    advanceRemediation(remediation, "verified", note),
  );
  const updatedFinding: Finding = {
    ...live,
    status: "resolved",
    resolvedNote: "Fix verified by re-running the runtime audit.",
  };
  payload.findings = [...(payload.findings ?? []), updatedFinding];
  evidenceEntry(payload, {
    kind: "remediation_verified",
    summary: `Verified: ${live.checkId} no longer fails at ${formatLocationRef(live.location)}`,
    projectId: live.projectId,
    controlId: live.controlId,
    findingId: live.id,
    detail: { engine },
  });
  mergeRefreshIntoPayload(
    payload,
    refreshRequirementStatusesForControls(
      project,
      findingsWithPayloadOverrides(db.findings, payload.findings),
      db.requirements,
      [live.controlId],
      {
        runtimeRan: audit.runtimeRan,
        siteLevelChecksRan: audit.siteLevelChecksRan,
        htmlValidateRan: audit.htmlValidateRan,
      },
    ),
  );
}

export async function verifyRemediationAction(
  findingIdRaw: string,
  previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  void previous;
  void formData;
  try {
    const findingId = parseInput(entityIdSchema, findingIdRaw);
    const preview = await getWorkspace();
    const finding = findingById(preview.db, findingId);
    requireOnFindingProject(preview, finding, "project.remediate");
    const previewRemediation = remediationForFinding(preview.db, findingId);
    if (previewRemediation.status !== "implemented") {
      throw new PublicError("Verification requires status implemented.");
    }

    const location = finding.location;
    switch (location.kind) {
      case "source":
        throw new PublicError(SOURCE_VERIFY_MESSAGE);
      case "dom": {
        const present = await runtimeViolationStillPresent({
          checkId: finding.checkId as CheckId,
          location,
        });
        let stillFailing = false;
        await withProjectWrite(
          { touch: "entities", findingIds: [findingId] },
          async (workspace) => {
            const { db } = workspace;
            const live = findingById(db, findingId);
            requireOnFindingProject(workspace, live, "project.remediate");
            const remediation = remediationForFinding(db, findingId);
            const payload: ProjectWritePayload = {};
            if (present) {
              stillFailing = true;
              recordStillFailing(payload, remediation);
              return { result: undefined, payload };
            }
            markVerified(
              db,
              payload,
              live,
              remediation,
              "Runtime re-audit found no remaining violation on the page",
              "runtime",
              { runtimeRan: true },
            );
            return { result: undefined, payload };
          },
        );
        refresh();
        if (stillFailing) {
          return { error: STILL_FAILING_VERIFY_MESSAGE, message: null };
        }
        return { error: null, message: "Fix verified by automated re-check." };
      }
      case "site": {
        const project = preview.db.projects.find(
          (candidate) => candidate.id === finding.projectId,
        );
        if (!project) throw new PublicError("Unknown project.");
        const result = await scanRuntime({
          runtimeBaseUrl: project.runtimeBaseUrl,
          runtimeRoutes: project.runtimeRoutes,
        });
        const present =
          Boolean(result.error) ||
          result.pagesScanned === 0 ||
          result.siteLevelChecksRan !== true ||
          result.findings.some((raw) => sameInstance(finding, raw));
        let stillFailing = false;
        await withProjectWrite(
          { touch: "entities", findingIds: [findingId] },
          async (workspace) => {
            const { db } = workspace;
            const live = findingById(db, findingId);
            requireOnFindingProject(workspace, live, "project.remediate");
            const remediation = remediationForFinding(db, findingId);
            const payload: ProjectWritePayload = {};
            if (present) {
              stillFailing = true;
              recordStillFailing(payload, remediation);
              return { result: undefined, payload };
            }
            markVerified(
              db,
              payload,
              live,
              remediation,
              "Runtime re-audit found no remaining site-level violation",
              "site",
              {
                runtimeRan: true,
                siteLevelChecksRan: result.siteLevelChecksRan,
                htmlValidateRan: result.htmlValidateRan,
              },
            );
            return { result: undefined, payload };
          },
        );
        refresh();
        if (stillFailing) {
          return { error: STILL_FAILING_VERIFY_MESSAGE, message: null };
        }
        return { error: null, message: "Fix verified by automated re-check." };
      }
      default: {
        const _exhaustive: never = location;
        throw new Error(`Unhandled finding location: ${String(_exhaustive)}`);
      }
    }
  } catch (error) {
    return actionErrorState(error);
  }
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
    await withProjectWrite(
      { touch: "entities", findingIds: [findingId] },
      async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const remediation = remediationForFinding(db, findingId);
      const note =
        parsedNote ??
        "Marked implemented by user (applied outside the platform)";
      const payload: ProjectWritePayload = {};

      replaceRemediation(
        payload,
        advanceRemediation(remediation, "implemented", note),
      );
      evidenceEntry(payload, {
        kind: "remediation_implemented",
        summary: `Remediation marked implemented for ${finding.checkId} at ${formatLocationRef(finding.location)}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: { manual: true, note },
      });
      return { result: undefined, payload };
    },
    );
    refresh();
    return "Marked as implemented.";
  });
}
