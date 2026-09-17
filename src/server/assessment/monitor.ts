import "server-only";

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import git from "isomorphic-git";

import type {
  AssessmentSnapshot,
  FileChange,
} from "@complyloop/analysis-core/contract/entities";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import { shouldSnapshotFile } from "@complyloop/analysis-core/source-files";

import { assessmentCheckoutQuota } from "../env";

function hashFileContents(absolutePath: string): string {
  const buffer = fs.readFileSync(absolutePath);
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Current commit of the checkout, or `undefined` when git metadata is absent.
 * Resolved with isomorphic-git (pure JS — no `git` CLI, which serverless
 * runtimes don't ship), so the unchanged-commit fast path in `runAssessment`
 * also fires where the binary is missing instead of always paying a full
 * re-hash + full re-scan.
 */
export async function readRepoHead(
  rootPath: string,
): Promise<string | undefined> {
  try {
    return await git.resolveRef({ fs, dir: rootPath, ref: "HEAD" });
  } catch {
    return undefined;
  }
}

export async function captureSnapshot(
  rootPath: string,
): Promise<AssessmentSnapshot> {
  // Single tree walk: quota-count every file but `.git` (same coverage as
  // `assertCheckoutWithinQuota`) while hashing exactly the snapshot set
  // (`shouldSnapshotFile` mirrors the old fast-glob enumeration, so snapshot
  // bytes — and therefore `detectChanges` diffs — are unchanged). Async +
  // time-budgeted so a huge tree cannot block the event loop.
  const { maxBytes, maxFiles, scanTimeoutMs } = assessmentCheckoutQuota();
  const deadline = Date.now() + scanTimeoutMs;
  const fileHashes: Record<string, string> = {};
  let bytes = 0;
  let files = 0;
  const pending = [rootPath];
  const quotaExceeded = (): PublicError =>
    new PublicError(
      `Repository exceeds the assessment quota (${maxFiles} files or ${Math.floor(maxBytes / 1024 / 1024)} MB).`,
      "assessment_quota_exceeded",
    );
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    let directory: fs.Dir;
    try {
      directory = await fs.promises.opendir(current);
    } catch {
      continue;
    }
    for await (const entry of directory) {
      if (Date.now() > deadline) {
        throw new PublicError(
          "Repository quota check timed out.",
          "assessment_quota_exceeded",
        );
      }
      if (entry.name === ".git") continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      files += 1;
      bytes += (await fs.promises.stat(absolute)).size;
      if (files > maxFiles || bytes > maxBytes) throw quotaExceeded();
      const relative = path.relative(rootPath, absolute);
      if (shouldSnapshotFile(relative)) {
        fileHashes[relative] = hashFileContents(absolute);
      }
    }
  }
  return { fileHashes, gitHead: await readRepoHead(rootPath) };
}

/**
 * Diffs the current tree against a previous assessment snapshot.
 * File paths only — a depth-1 clone cannot attribute who last touched a file.
 */
export async function detectChanges(
  rootPath: string,
  previous: AssessmentSnapshot | undefined,
): Promise<{ snapshot: AssessmentSnapshot; changes: FileChange[] }> {
  const gitHead = await readRepoHead(rootPath);
  // Unchanged commit: reuse the previous snapshot instead of re-reading and
  // SHA-256ing every source file. The AST scan is likewise skipped by the
  // caller when the control/engine scope is also unchanged.
  if (previous && gitHead !== undefined && previous.gitHead === gitHead) {
    return { snapshot: previous, changes: [] };
  }
  const snapshot = await captureSnapshot(rootPath);
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
  if (changes.length === 0)
    return "No source changes since the previous assessment.";
  const files = changes.slice(0, 5).map((change) => change.filePath);
  const more = changes.length > 5 ? ` (+${changes.length - 5} more)` : "";
  return `${changes.length} file(s) changed: ${files.join(", ")}${more}`;
}
