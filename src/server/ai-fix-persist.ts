import type { PatchCandidate } from "@/ai/verified-fix";
import { formatLocationRef } from "@/core/location";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { advanceRemediation } from "@/core/remediation";
import type { Finding } from "@complyloop/analysis-core/contract/finding-types";
import { addEvidence, type Db } from "./db";
import { patchCandidateDetail } from "./ai-fix-result";

function snippetFromCandidate(candidate: PatchCandidate): string {
  return (candidate.edits[0]?.newText ?? candidate.description).slice(0, 500);
}

export function persistPatchCandidate(
  db: Db,
  finding: Finding,
  candidate: PatchCandidate,
): void {
  const location = formatLocationRef(finding.location);
  addEvidence(db, {
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
  remediation.suggestion = {
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
    const index = db.remediations.findIndex((row) => row.id === remediation.id);
    if (index < 0) return;
    db.remediations[index] = advanceRemediation(
      remediation,
      "suggested",
      `Patch ready: ${candidate.description}`,
    );
  } else if (remediation.status === "suggested") {
    remediation.history.push({
      status: "suggested",
      at: new Date().toISOString(),
      note: `Patch refreshed: ${candidate.description}`,
    });
  }
}
