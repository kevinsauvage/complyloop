import fs from "node:fs";
import { applyFix, describeFix } from "@/analysis/fixes";
import { scanChangedFiles } from "@/analysis/scan";
import { resolveInside } from "@/analysis/workspace-path";
import { proposeFixEdits } from "@/ai/fix-propose";
import {
  generatePatchCandidate,
  type GeneratePatchCandidateOptions,
  type PatchCandidate,
  type ProposedFixEdits,
} from "@/ai/verified-fix";
import { isSourceLocation } from "@/core/location";
import { PublicError } from "@/core/public-error";
import type { Control } from "@/core/project-types";
import { hasSafeDeterministicFix } from "@/core/finding-act";
import type { Finding } from "@/core/finding-types";
import { locateViolationInProject, mergeFix } from "./assessment-helpers";

export interface RunAiFixOnCheckoutOptions {
  propose?: GeneratePatchCandidateOptions["propose"];
  scan?: GeneratePatchCandidateOptions["scan"];
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
    throw new PublicError(
      "Patch PRs are only available for source findings. Use the developer handoff for runtime DOM findings.",
    );
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

  return generatePatchCandidate({
    rootPath,
    finding,
    propose,
    scan:
      options.scan ??
      ((relativePaths) => scanChangedFiles(rootPath, relativePaths).findings),
  });
}
