"use server";

import fs from "node:fs";
import { applyFix } from "@/analysis/fixes";
import { resolveInside } from "@/analysis/workspace-path";
import { formatLocationRef, isSourceLocation } from "@/core/location";
import { advanceRemediation } from "@/core/remediation";
import {
  runActionMessage,
  type ActionMessageState,
} from "../action-state";
import { mergeFix } from "../assessment-helpers";
import { addEvidence } from "../db";
import { withProjectCheckout } from "../repo-checkout";
import {
  findingById,
  getWorkspace,
  remediationForFinding,
  withWorkspaceWrite,
} from "../workspace";
import {
  locateViolation,
  refresh,
  replaceRemediation,
  requireOnFindingProject,
} from "./shared";

export async function approveRemediationAction(
  findingId: string,
  _previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  return runActionMessage(async () => {
    await withWorkspaceWrite(async (workspace) => {
      const { db } = workspace;
      const finding = findingById(db, findingId);
      requireOnFindingProject(workspace, finding, "project.remediate");
      const remediation = remediationForFinding(db, findingId);

      const editedValue = formData.get("value");
      if (
        typeof editedValue === "string" &&
        editedValue.trim().length > 0 &&
        finding.fix?.kind === "insert_attribute" &&
        finding.fix.editable
      ) {
        finding.fix = { ...finding.fix, value: editedValue.trim() };
        if (remediation.suggestion) {
          remediation.suggestion = {
            ...remediation.suggestion,
            description: remediation.suggestion.description,
            proposedSnippet: editedValue.trim(),
          };
        }
      }

      replaceRemediation(
        db,
        advanceRemediation(remediation, "approved", "Approved by user"),
      );
      addEvidence(db, {
        kind: "remediation_approved",
        summary: `Remediation approved for ${finding.checkId} at ${formatLocationRef(finding.location)}`,
        projectId: finding.projectId,
        controlId: finding.controlId,
        findingId: finding.id,
        detail: finding.fix ? { fix: { ...finding.fix } } : undefined,
      });
    });
    refresh();
    return "Remediation approved.";
  });
}

export async function applyRemediationAction(
  findingId: string,
  previous: ActionMessageState,
  formData: FormData,
): Promise<ActionMessageState> {
  void previous;
  void formData;
  return runActionMessage(async () => {
    const preview = await getWorkspace();
    const finding = findingById(preview.db, findingId);
    requireOnFindingProject(preview, finding, "project.remediate");
    if (!finding.fix) throw new Error("This finding has no automatable fix.");
    if (!isSourceLocation(finding.location)) {
      throw new Error(
        "Runtime DOM findings cannot be auto-applied — fix the call site and verify with a re-audit.",
      );
    }
    const project = preview.db.projects.find(
      (candidate) => candidate.id === finding.projectId,
    );
    if (!project) throw new Error(`Unknown project: ${finding.projectId}`);

    await withProjectCheckout(project, async (rootPath) => {
      await withWorkspaceWrite(async (workspace) => {
        const { db } = workspace;
        const live = findingById(db, findingId);
        requireOnFindingProject(workspace, live, "project.remediate");
        const remediation = remediationForFinding(db, findingId);
        if (!live.fix) {
          throw new Error("This finding has no automatable fix.");
        }

        const { match } = locateViolation(db, live, rootPath);
        if (!match?.fix) {
          throw new Error(
            "The violation could not be re-located in the current file.",
          );
        }
        const fix = mergeFix(live.fix, match.fix);
        if (!fix) throw new Error("No applicable fix.");
        if (!isSourceLocation(live.location)) {
          throw new Error("Expected a source location.");
        }

        // Prove the fix applies on a fresh checkout; durable change is via Create PR.
        const absolutePath = resolveInside(rootPath, live.location.filePath);
        const text = fs.readFileSync(absolutePath, "utf8");
        fs.writeFileSync(absolutePath, applyFix(text, fix));

        replaceRemediation(
          db,
          advanceRemediation(
            remediation,
            "implemented",
            "Suggested change verified on ephemeral checkout — open a PR to push it",
          ),
        );
        addEvidence(db, {
          kind: "remediation_implemented",
          summary: `Change verified for ${formatLocationRef(live.location)} (open a PR to push)`,
          projectId: live.projectId,
          controlId: live.controlId,
          findingId: live.id,
          detail: { fix: { ...fix } },
        });
      });
    });
    refresh();
    return "Change verified on a fresh checkout. Open a pull request to push it to GitHub.";
  });
}
