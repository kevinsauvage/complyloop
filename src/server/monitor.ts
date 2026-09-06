import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { listSourceFiles } from "@complyloop/analysis-core/source-files";
import type { AssessmentSnapshot, FileChange } from "@complyloop/db/types";

function hashFileContents(absolutePath: string): string {
  const buffer = fs.readFileSync(absolutePath);
  return createHash("sha256").update(buffer).digest("hex");
}

export function captureSnapshot(rootPath: string): AssessmentSnapshot {
  const fileHashes: Record<string, string> = {};
  for (const absolute of listSourceFiles(rootPath, "script")) {
    const relative = path.relative(rootPath, absolute);
    fileHashes[relative] = hashFileContents(absolute);
  }
  let gitHead: string | undefined;
  try {
    gitHead = execFileSync("git", ["-C", rootPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    gitHead = undefined;
  }
  return { fileHashes, gitHead };
}

/**
 * Diffs the current tree against a previous assessment snapshot.
 * File paths only — a depth-1 clone cannot attribute who last touched a file.
 */
export function detectChanges(
  rootPath: string,
  previous: AssessmentSnapshot | undefined,
): { snapshot: AssessmentSnapshot; changes: FileChange[] } {
  const snapshot = captureSnapshot(rootPath);
  if (!previous) {
    return { snapshot, changes: [] };
  }

  const previousPaths = new Set(Object.keys(previous.fileHashes));
  const currentPaths = new Set(Object.keys(snapshot.fileHashes));
  const changed = new Set<string>();

  for (const filePath of currentPaths) {
    if (previous.fileHashes[filePath] !== snapshot.fileHashes[filePath]) {
      changed.add(filePath);
    }
  }
  for (const filePath of previousPaths) {
    if (!currentPaths.has(filePath)) changed.add(filePath);
  }

  const changes: FileChange[] = [...changed].sort().map((filePath) => ({
    filePath,
  }));

  return { snapshot, changes };
}

export function summarizeChanges(changes: FileChange[]): string {
  if (changes.length === 0) return "No source changes since the previous assessment.";
  const files = changes.slice(0, 5).map((change) => change.filePath);
  const more = changes.length > 5 ? ` (+${changes.length - 5} more)` : "";
  return `${changes.length} file(s) changed: ${files.join(", ")}${more}`;
}
