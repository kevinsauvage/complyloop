"use server";

import type { CheckId } from "@complyloop/analysis-core/types";
import type { Finding, Remediation } from "@complyloop/analysis-core/contract/finding-types";
import {
  runtimeViolationStillPresent,
  scanRuntime,
} from "@complyloop/analysis-core/runtime/scan";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { advanceRemediation } from "@/core/remediation";
import { entityIdSchema, optionalNoteSchema } from "@/core/boundary";
import { z } from "zod";
import {
  actionErrorState,
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { parseForm, parseInput } from "../boundary";
import { sameInstance } from "../assessment-helpers";
import { refreshRequirementStatusesForControls } from "../assessment-status";
import type { ProjectWriteCollector } from "../workspace";
import type { Db } from "../db";
import { STILL_FAILING_VERIFY_MESSAGE } from "../verify-messages";
import {
  findingById,
  getWorkspace,
  remediationForFinding,
  withProjectWrite,
} from "../workspace";
import {
  refresh,
  replaceRemediation,
  requireOnFindingProject,
} from "./shared";

const markImplementedInput = z.object({
  note: optionalNoteSchema,
});

const SOURCE_VERIFY_MESSAGE =
  "Source findings are verified by merging the draft pull request and re-assessing.";

interface VerifyAuditFlags {
  runtimeRan: boolean;
  siteLevelChecksRan?: boolean;
  htmlValidateRan?: boolean;
}

function recordStillFailing(
  remediation: Remediation,
  writes: ProjectWriteCollector,
): void {
  remediation.history.push({
    status: remediation.status,
    at: new Date().toISOString(),
    note: "Verification failed: the violation is still detected on the page.",
  });
  writes.upsertRemediation(remediation);
}

function markVerified(
  db: Db,
  writes: ProjectWriteCollector,
  live: Finding,
  remediation: Remediation,
  note: string,
  engine: "runtime" | "site",
  audit: VerifyAuditFlags,
): void {
  replaceRemediation(
    db,
    advanceRemediation(remediation, "verified", note),
    writes,
  );
  live.status = "resolved";
  live.resolvedNote = "Fix verified by re-running the runtime audit.";
  writes.upsertFinding(live);
  writes.addEvidence({
    kind: "remediation_verified",
    summary: `Verified: ${live.checkId} no longer fails at ${formatLocationRef(live.location)}`,
    projectId: live.projectId,
    controlId: live.controlId,
    findingId: live.id,
    detail: { engine },
  });
  refreshRequirementStatusesForControls(db, live.projectId, [live.controlId], {
    runtimeRan: audit.runtimeRan,
    siteLevelChecksRan: audit.siteLevelChecksRan,
    htmlValidateRan: audit.htmlValidateRan,
    writes,
  });
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
          async (workspace, writes) => {
            const { db } = workspace;
            const live = findingById(db, findingId);
            requireOnFindingProject(workspace, live, "project.remediate");
            const remediation = remediationForFinding(db, findingId);
            if (present) {
              stillFailing = true;
              recordStillFailing(remediation, writes);
              return;
            }
            markVerified(
              db,
              writes,
              live,
              remediation,
              "Runtime re-audit found no remaining violation on the page",
              "runtime",
              { runtimeRan: true },
            );
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
          async (workspace, writes) => {
            const { db } = workspace;
            const live = findingById(db, findingId);
            requireOnFindingProject(workspace, live, "project.remediate");
            const remediation = remediationForFinding(db, findingId);
            if (present) {
              stillFailing = true;
              recordStillFailing(remediation, writes);
              return;
            }
            markVerified(
              db,
              writes,
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
      async (workspace, writes) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const remediation = remediationForFinding(db, findingId);
      const note =
        parsedNote ??
        "Marked implemented by user (applied outside the platform)";

      replaceRemediation(
        db,
        advanceRemediation(remediation, "implemented", note),
        writes,
      );
      writes.addEvidence({
        kind: "remediation_implemented",
        summary: `Remediation marked implemented for ${finding.checkId} at ${formatLocationRef(finding.location)}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: { manual: true, note },
      });
    },
    );
    refresh();
    return "Marked as implemented.";
  });
}
