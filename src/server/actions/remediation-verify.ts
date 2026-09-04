"use server";

import fs from "node:fs";
import { applyFix } from "@complyloop/analysis-core/fixes";
import type { CheckId } from "@complyloop/analysis-core/types";
import { runtimeViolationStillPresent } from "@complyloop/analysis-core/runtime/scan";
import { resolveInside } from "@complyloop/analysis-core/workspace-path";
import { formatLocationRef, isSourceLocation } from "@/core/location";
import { PublicError } from "@/core/public-error";
import { advanceRemediation } from "@/core/remediation";
import {
  actionErrorState,
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { mergeFix } from "../assessment-helpers";
import { refreshRequirementStatuses } from "../assessment-status";
import { addEvidence } from "../db";
import { withProjectCheckout } from "../repo-checkout";
import { STILL_FAILING_VERIFY_MESSAGE } from "../verify-messages";
import {
  findingById,
  getWorkspace,
  remediationForFinding,
  withProjectWrite,
} from "../workspace";
import {
  locateViolation,
  refresh,
  replaceRemediation,
  requireOnFindingProject,
  sessionCheckoutTokenOptions,
} from "./shared";

export async function verifyRemediationAction(
  findingId: string,
  previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  void previous;
  void formData;
  try {
    let stillFailing = false;
    const preview = await getWorkspace();
    const finding = findingById(preview.db, findingId);
    requireOnFindingProject(preview, finding, "project.remediate");

    if (finding.location.kind === "dom") {
      await withProjectWrite(async (workspace) => {
        const { db } = workspace;
        const live = findingById(db, findingId);
        requireOnFindingProject(workspace, live, "project.remediate");
        const remediation = remediationForFinding(db, findingId);
        const present = await runtimeViolationStillPresent({
          checkId: live.checkId as CheckId,
          location: live.location,
        });
        if (present) {
          stillFailing = true;
          remediation.history.push({
            status: remediation.status,
            at: new Date().toISOString(),
            note: "Verification failed: the violation is still detected on the page.",
          });
          return;
        }
        replaceRemediation(
          db,
          advanceRemediation(
            remediation,
            "verified",
            "Runtime re-audit found no remaining violation on the page",
          ),
        );
        live.status = "resolved";
        live.resolvedNote = "Fix verified by re-running the runtime audit.";
        addEvidence(db, {
          kind: "remediation_verified",
          summary: `Verified: ${live.checkId} no longer fails at ${formatLocationRef(live.location)}`,
          projectId: live.projectId,
          controlId: live.controlId,
          findingId: live.id,
          detail: { engine: "runtime" },
        });
        refreshRequirementStatuses(db, live.projectId);
      });
    } else {
      const project = preview.db.projects.find(
        (candidate) => candidate.id === finding.projectId,
      );
      if (!project) throw new PublicError("Unknown project.");
      const tokenOptions = await sessionCheckoutTokenOptions();

      await withProjectCheckout(
        project,
        async (rootPath) => {
        await withProjectWrite(async (workspace) => {
          const { db } = workspace;
          const live = findingById(db, findingId);
          requireOnFindingProject(workspace, live, "project.remediate");
          const remediation = remediationForFinding(db, findingId);

          // Apply the proposed fix on the ephemeral tree, then re-scan.
          if (live.fix && isSourceLocation(live.location)) {
            const match = locateViolation(db, live, rootPath).match;
            const fix = mergeFix(live.fix, match?.fix ?? null);
            if (fix) {
              const absolutePath = resolveInside(
                rootPath,
                live.location.filePath,
              );
              const text = fs.readFileSync(absolutePath, "utf8");
              fs.writeFileSync(absolutePath, applyFix(text, fix));
            }
          }

          const { match } = locateViolation(db, live, rootPath);
          if (match) {
            stillFailing = true;
            remediation.history.push({
              status: remediation.status,
              at: new Date().toISOString(),
              note: "Verification failed: the violation is still detected at this location.",
            });
            return;
          }

          replaceRemediation(
            db,
            advanceRemediation(
              remediation,
              "verified",
              "Automated re-check found no remaining violation after applying the suggested fix",
            ),
          );
          live.status = "resolved";
          live.resolvedNote = "Fix verified by re-running the automated check.";
          addEvidence(db, {
            kind: "remediation_verified",
            summary: `Verified: ${live.checkId} no longer fails at ${formatLocationRef(live.location)}`,
            projectId: live.projectId,
            controlId: live.controlId,
            findingId: live.id,
            detail: { engine: "ast" },
          });
          refreshRequirementStatuses(db, live.projectId);
        });
        },
        undefined,
        tokenOptions,
      );
    }

    refresh();
    if (stillFailing) {
      return {
        error: STILL_FAILING_VERIFY_MESSAGE,
        message: null,
      };
    }
    return { error: null, message: "Fix verified by automated re-check." };
  } catch (error) {
    return actionErrorState(error);
  }
}

/**
 * Marks an approved remediation as implemented when the engineer applied the
 * change outside ComplyLoop (or there is no automatable fix).
 */
export async function markRemediationImplementedAction(
  findingId: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    await withProjectWrite(async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const remediation = remediationForFinding(db, findingId);
      const noteRaw = formData.get("note");
      const note =
        typeof noteRaw === "string" && noteRaw.trim().length > 0
          ? noteRaw.trim()
          : "Marked implemented by user (applied outside the platform)";

      replaceRemediation(
        db,
        advanceRemediation(remediation, "implemented", note),
      );
      addEvidence(db, {
        kind: "remediation_implemented",
        summary: `Remediation marked implemented for ${finding.checkId} at ${formatLocationRef(finding.location)}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: { manual: true, note },
      });
    });
    refresh();
    return "Marked as implemented.";
  });
}

/**
 * Human verification path when automated re-check is unavailable or the user
 * has verified the fix by other means. Still requires an explicit note.
 */
export async function manualVerifyRemediationAction(
  findingId: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    await withProjectWrite(async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const remediation = remediationForFinding(db, findingId);
      const noteRaw = formData.get("note");
      if (typeof noteRaw !== "string" || noteRaw.trim().length === 0) {
        throw new PublicError(
          "A verification note is required for manual verification.",
        );
      }
      const note = noteRaw.trim();

      if (remediation.status !== "implemented") {
        throw new PublicError("Manual verification requires status implemented.");
      }

      replaceRemediation(
        db,
        advanceRemediation(
          remediation,
          "verified",
          `Manual verification: ${note}`,
        ),
      );
      finding.status = "resolved";
      finding.resolvedNote = `Manually verified by human review: ${note}`;
      addEvidence(db, {
        kind: "remediation_manually_verified",
        summary: `Manually verified ${finding.checkId} at ${formatLocationRef(finding.location)}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: { note, determination: "human_review" },
      });
      refreshRequirementStatuses(db, finding.projectId);
    });
    refresh();
    return "Manually verified.";
  });
}
