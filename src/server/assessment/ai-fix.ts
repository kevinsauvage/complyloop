import "server-only";

import fs from "node:fs";

import {
  type EvidenceRecord,
  type Finding,
} from "@complyloop/analysis-core/contract/entities";
import { formatLocationRef } from "@complyloop/analysis-core/contract/location";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { applyFix, describeFix } from "@complyloop/analysis-core/fixes";
import { scanChangedFiles } from "@complyloop/analysis-core/scan";
import { resolveInside } from "@complyloop/analysis-core/workspace-path";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import type { WorkspaceSlice } from "@complyloop/db/types";

import { AI_PATCH_UNAVAILABLE_MESSAGE, type AiCallOnError } from "@/ai/ai-call";
import { proposeFixEdits } from "@/ai/patch";
import {
  assertSourceLocatedFinding,
  generatePatchCandidate,
  type GeneratePatchCandidateOptions,
  type PatchCandidate,
  patchCandidateFromDetail,
  patchCandidateToDetail,
  type ProposedFixEdits,
} from "@/ai/verified-fix";
import {
  hasSafeDeterministicFix,
  refreshSuggestion,
} from "@/core/remediation-lifecycle";

import { reportError, reportWarning } from "../observability";
import { appendEvidence } from "../workspace/project-rows";
import { locateViolationInProject, mergeFix } from "./assessment-findings";
import { withProjectCheckout } from "./repo-checkout";

export type PatchUiState =
  { status: "idle" } | { status: "ready"; candidate: PatchCandidate };

export interface RunAiFixOnCheckoutOptions {
  propose?: GeneratePatchCandidateOptions["propose"];
  scan?: GeneratePatchCandidateOptions["scan"];
  /** When false, patch generation fails fast with actionable copy. */
  aiAvailable?: boolean;
  /** Gateway-failure hook; defaults to observability reporting. */
  onError?: AiCallOnError;
}

function deterministicProposal(
  rootPath: string,
  finding: Finding,
): ProposedFixEdits | null {
  if (!finding.fix || finding.location.kind !== "source") return null;
  if (finding.fix.kind === "insert_attribute" && finding.fix.editable) {
    return null;
  }
  const match = locateViolationInProject(rootPath, finding);
  const fix = match?.fix ? mergeFix(finding.fix, match.fix) : null;
  if (!fix || match?.location.kind !== "source") return null;
  const path = match.location.filePath;
  const original = fs.readFileSync(resolveInside(rootPath, path), "utf8");
  return {
    description: describeFix(fix),
    provenance: "deterministic",
    edits: [{ path, oldText: original, newText: applyFix(original, fix) }],
  };
}

export async function runAiFixOnCheckout(
  rootPath: string,
  finding: Finding,
  control: Control,
  options: RunAiFixOnCheckoutOptions = {},
): Promise<PatchCandidate> {
  assertSourceLocatedFinding(finding);
  const filePath = finding.location.filePath;
  const deterministic = deterministicProposal(rootPath, finding);
  if (hasSafeDeterministicFix(finding) && deterministic === null) {
    throw new PublicError(
      "The deterministic fix could not be re-located. Re-run the assessment and try again.",
    );
  }
  const onError: AiCallOnError = options.onError ?? reportError;
  const propose =
    deterministic !== null
      ? async () => deterministic
      : (options.propose ??
        (async () =>
          proposeFixEdits({
            finding,
            control,
            onError,
            fileContents: {
              [filePath]: fs.readFileSync(
                resolveInside(rootPath, filePath),
                "utf8",
              ),
            },
          })));

  if (deterministic === null && options.aiAvailable === false) {
    throw new PublicError(AI_PATCH_UNAVAILABLE_MESSAGE);
  }

  return generatePatchCandidate({
    rootPath,
    finding,
    propose,
    scan:
      options.scan ??
      ((relativePaths) => scanChangedFiles(rootPath, relativePaths).findings),
  });
}

/**
 * Checkout + patch composition for the action layer: runs
 * `runAiFixOnCheckout` on an ephemeral checkout of the finding's project.
 * Actions call this (never `withProjectCheckout` + `runAiFixOnCheckout`
 * separately) so checkout wiring stays in one module.
 */
export async function generatePatchCandidateOnCheckout(
  project: Project,
  finding: Finding,
  control: Control,
  options: { aiAvailable: boolean },
): Promise<PatchCandidate> {
  return withProjectCheckout(project, (rootPath) =>
    runAiFixOnCheckout(rootPath, finding, control, {
      aiAvailable: options.aiAvailable,
    }),
  );
}

export function patchCandidateFromEvidence(
  evidence: ReadonlyArray<Pick<EvidenceRecord, "kind" | "summary" | "detail">>,
): PatchCandidate | null {
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const record = evidence[index];
    if (!record) continue;
    if (record.kind === "ai_patch_ready") {
      return patchCandidateFromDetail(record.detail);
    }
  }
  return null;
}

export function pullRequestUrlFromEvidence(
  evidence: ReadonlyArray<Pick<EvidenceRecord, "kind" | "detail">>,
): string | null {
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const record = evidence[index];
    if (record?.kind !== "pull_request_prepared") continue;
    const prUrl = record.detail?.prUrl;
    if (typeof prUrl === "string" && prUrl.length > 0) {
      return prUrl;
    }
  }
  return null;
}

export function latestPatchState(
  evidence: ReadonlyArray<Pick<EvidenceRecord, "kind" | "summary" | "detail">>,
): PatchUiState {
  const candidate = patchCandidateFromEvidence(evidence);
  return candidate ? { status: "ready", candidate } : { status: "idle" };
}

function snippetFromCandidate(candidate: PatchCandidate): string {
  return (candidate.edits[0]?.newText ?? candidate.description).slice(0, 500);
}

export function persistPatchCandidate(
  db: WorkspaceSlice,
  finding: Finding,
  candidate: PatchCandidate,
  payload: ProjectWritePayload,
): void {
  const location = formatLocationRef(finding.location);
  appendEvidence(payload, {
    kind: "ai_patch_ready",
    summary: `Patch ready for ${finding.checkId} at ${location} (ComplyLoop passed).`,
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    detail: patchCandidateToDetail(candidate),
  });
  const remediation = db.remediations.find(
    (row) => row.findingId === finding.id,
  );
  if (!remediation) {
    throw new PublicError("No remediation for that finding.");
  }
  const suggestion = {
    description: candidate.description,
    proposedSnippet: snippetFromCandidate(candidate),
    provenance: candidate.provenance,
    ...(candidate.provenance === "ai"
      ? {
          confidence: "medium" as const,
          model: candidate.model,
          generatedAt: new Date().toISOString(),
        }
      : {}),
  };
  if (remediation.status !== "detected" && remediation.status !== "suggested") {
    // The remediation advanced while the patch was generating, so the ready
    // patch is not persisted — applying it onto a moved-forward state would
    // be unsound.
    reportWarning(
      "AI patch ready but remediation already advanced; suggestion not persisted.",
      {
        code: "ai_patch_skipped_status",
        findingId: finding.id,
        status: remediation.status,
      },
    );
    return;
  }
  payload.remediations = [
    ...(payload.remediations ?? []),
    refreshSuggestion(
      remediation,
      suggestion,
      remediation.status === "detected"
        ? `Patch ready: ${candidate.description}`
        : `Patch refreshed: ${candidate.description}`,
    ),
  ];
}
