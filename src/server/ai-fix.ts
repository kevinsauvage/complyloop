import fs from "node:fs";
import { applyFix, describeFix } from "@complyloop/analysis-core/fixes";
import { scanChangedFiles } from "@complyloop/analysis-core/scan";
import { resolveInside } from "@complyloop/analysis-core/workspace-path";
import { proposeFixEdits } from "@/ai/patch";
import {
  generatePatchCandidate,
  PATCH_PR_SOURCE_ONLY_MESSAGE,
  type FileEdit,
  type GeneratePatchCandidateOptions,
  type PatchCandidate,
  type ProposedFixEdits,
} from "@/ai/verified-fix";
import {
  formatLocationRef,
  isSourceLocation,
} from "@complyloop/analysis-core/contract/location";
import { type EvidenceRecord, type Finding } from "@complyloop/db/types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import type { Control } from "@complyloop/analysis-core/contract/project-types";
import { hasSafeDeterministicFix } from "@/core/finding-act";
import { advanceRemediation } from "@/core/remediation";
import type { ProjectWritePayload } from "@complyloop/db/repo/apply";
import type { Db } from "./db";
import { locateViolationInProject, mergeFix } from "./assessment-findings";
import { evidenceEntry } from "./evidence-payload";

export type PatchUiState =
  | { status: "idle" }
  | { status: "ready"; candidate: PatchCandidate };

export interface RunAiFixOnCheckoutOptions {
  propose?: GeneratePatchCandidateOptions["propose"];
  scan?: GeneratePatchCandidateOptions["scan"];
  /** When false, patch generation fails fast with actionable copy. */
  aiAvailable?: boolean;
}

function exactLineEdit(
  path: string,
  original: string,
  fixed: string,
  line: number,
): ProposedFixEdits["edits"][number] {
  const oldLine = original.split("\n")[line - 1];
  const newLine = fixed.split("\n")[line - 1];
  if (
    oldLine !== undefined &&
    newLine !== undefined &&
    oldLine !== newLine &&
    original.split(oldLine).length === 2
  ) {
    return { path, oldText: oldLine, newText: newLine };
  }
  return { path, oldText: original, newText: fixed };
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
    edits: [
      exactLineEdit(path, original, applyFix(original, fix), match.location.line),
    ],
  };
}

export async function runAiFixOnCheckout(
  rootPath: string,
  finding: Finding,
  control: Control,
  options: RunAiFixOnCheckoutOptions = {},
): Promise<PatchCandidate> {
  if (!isSourceLocation(finding.location)) {
    throw new PublicError(PATCH_PR_SOURCE_ONLY_MESSAGE);
  }
  const filePath = finding.location.filePath;
  const deterministic = deterministicProposal(rootPath, finding);
  if (hasSafeDeterministicFix(finding) && deterministic === null) {
    throw new PublicError(
      "The deterministic fix could not be re-located. Re-run the assessment and try again.",
    );
  }
  const propose =
    deterministic !== null
      ? async () => deterministic
      : options.propose ??
        (async () =>
          proposeFixEdits({
            finding,
            control,
            fileContents: {
              [filePath]: fs.readFileSync(
                resolveInside(rootPath, filePath),
                "utf8",
              ),
            },
          }));

  if (deterministic === null && options.aiAvailable === false) {
    throw new PublicError(
      "Generating a patch requires AI (set AI_GATEWAY_API_KEY) or a deterministic fix template for this Finding. Use the developer handoff to fix it manually.",
    );
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseEdits(value: unknown): FileEdit[] {
  if (!Array.isArray(value)) return [];
  const edits: FileEdit[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (
      !record ||
      typeof record.path !== "string" ||
      typeof record.oldText !== "string" ||
      typeof record.newText !== "string"
    ) {
      continue;
    }
    edits.push({
      path: record.path,
      oldText: record.oldText,
      newText: record.newText,
    });
  }
  return edits;
}

function parsePatchCandidateDetail(
  detail: Record<string, unknown> | undefined,
): PatchCandidate | null {
  if (
    !detail ||
    typeof detail.description !== "string" ||
    (detail.provenance !== "ai" && detail.provenance !== "deterministic") ||
    detail.complyLoopPassed !== true
  ) {
    return null;
  }
  const edits = parseEdits(detail.edits);
  if (edits.length === 0) return null;
  const remaining = Array.isArray(detail.remaining)
    ? detail.remaining.filter((item): item is string => typeof item === "string")
    : [];
  return {
    description: detail.description,
    provenance: detail.provenance,
    ...(typeof detail.model === "string" ? { model: detail.model } : {}),
    edits,
    complyLoop: { passed: true, remaining },
  };
}

export function patchCandidateDetail(
  candidate: PatchCandidate,
): Record<string, unknown> {
  return {
    description: candidate.description,
    provenance: candidate.provenance,
    ...(candidate.model ? { model: candidate.model } : {}),
    edits: candidate.edits,
    complyLoopPassed: candidate.complyLoop.passed,
    remaining: candidate.complyLoop.remaining,
  };
}

export function patchCandidateFromEvidence(
  evidence: ReadonlyArray<Pick<EvidenceRecord, "kind" | "summary" | "detail">>,
): PatchCandidate | null {
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const record = evidence[index];
    if (!record) continue;
    if (record.kind === "ai_patch_ready") {
      return parsePatchCandidateDetail(record.detail);
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
  db: Db,
  finding: Finding,
  candidate: PatchCandidate,
  payload: ProjectWritePayload,
): void {
  const location = formatLocationRef(finding.location);
  evidenceEntry(payload, {
    kind: "ai_patch_ready",
    summary: `Patch ready for ${finding.checkId} at ${location} (ComplyLoop passed).`,
    projectId: finding.projectId,
    controlId: finding.controlId,
    findingId: finding.id,
    detail: patchCandidateDetail(candidate),
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
  if (remediation.status === "detected") {
    const withSuggestion = { ...remediation, suggestion };
    const updated = advanceRemediation(
      withSuggestion,
      "suggested",
      `Patch ready: ${candidate.description}`,
    );
    payload.remediations = [...(payload.remediations ?? []), updated];
  } else if (remediation.status === "suggested") {
    const updated: typeof remediation = {
      ...remediation,
      suggestion,
      history: [
        ...remediation.history,
        {
          status: "suggested",
          at: new Date().toISOString(),
          note: `Patch refreshed: ${candidate.description}`,
        },
      ],
    };
    payload.remediations = [...(payload.remediations ?? []), updated];
  }
}
