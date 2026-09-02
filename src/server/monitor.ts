import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { listSourceFiles } from "@complyloop/analysis-core/source-files";
import type { AssessmentSnapshot, FileChange } from "@/core/finding-types";

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

function gitBlameLine(
  rootPath: string,
  filePath: string,
): Pick<FileChange, "author" | "commitSha" | "commitSubject"> | undefined {
  try {
    const raw = execFileSync(
      "git",
      ["-C", rootPath, "log", "-1", "--format=%H%x09%an%x09%s", "--", filePath],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (!raw) return undefined;
    const [commitSha, author, commitSubject] = raw.split("\t");
    return { commitSha, author, commitSubject };
  } catch {
    return undefined;
  }
}

/**
 * Diffs the current tree against a previous assessment snapshot and attributes
 * each changed file via git log when available.
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

  const changes: FileChange[] = [...changed].sort().map((filePath) => {
    const blame = gitBlameLine(rootPath, filePath);
    return { filePath, ...blame };
  });

  return { snapshot, changes };
}

export function summarizeChanges(changes: FileChange[]): string {
  if (changes.length === 0) return "No source changes since the previous assessment.";
  const authors = [
    ...new Set(changes.map((change) => change.author).filter(Boolean)),
  ] as string[];
  const files = changes.slice(0, 5).map((change) => change.filePath);
  const more = changes.length > 5 ? ` (+${changes.length - 5} more)` : "";
  const who = authors.length > 0 ? ` by ${authors.join(", ")}` : "";
  return `${changes.length} file(s) changed${who}: ${files.join(", ")}${more}`;
}
