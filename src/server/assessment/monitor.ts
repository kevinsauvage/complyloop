import "server-only";

import fs from "node:fs";
import path from "node:path";

import git from "isomorphic-git";

import type { FileChange } from "@complyloop/analysis-core/contract/entities";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { assessmentCheckoutQuota } from "../env";
import type { ChangedPath } from "../github/compare";
import { reportWarning } from "../observability";

/** One commit comparison: changed paths, or `null` when it cannot be made. */
export type CompareCommits = (
  base: string,
  head: string,
) => Promise<ChangedPath[] | null>;

/**
 * Current commit of the checkout, or `undefined` when git metadata is absent.
 * Resolved with isomorphic-git (pure JS — no `git` CLI, which serverless
 * runtimes don't ship), so the unchanged-commit fast path in `runAssessment`
 * also fires where the binary is missing.
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

/**
 * Enforces the per-checkout quota: counts every file (and its bytes) outside
 * `.git`, failing loud before an oversized tree is parsed. Async and
 * time-budgeted so a huge tree cannot block the event loop.
 */
export async function assertCheckoutQuota(rootPath: string): Promise<void> {
  const { maxBytes, maxFiles, scanTimeoutMs } = assessmentCheckoutQuota();
  const deadline = Date.now() + scanTimeoutMs;
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
    } catch (error) {
      reportWarning("Checkout quota scan could not open a directory", {
        code: "assessment_quota_opendir_failed",
        path: current,
        error: error instanceof Error ? error.message : String(error),
      });
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
    }
  }
}

export interface ChangeSet {
  /** Changed paths that exist at `head`. Empty when nothing changed. */
  changes: FileChange[];
  /** Paths that existed before and are gone now (deleted or renamed away). */
  removed: string[];
  /**
   * False when the range could not be compared (no previous commit, a
   * force-push, an API failure, too many files). Callers must scan the whole
   * tree: "unknown" is never "nothing changed".
   */
  comparable: boolean;
}

const NOT_COMPARABLE: ChangeSet = {
  changes: [],
  removed: [],
  comparable: false,
};

/**
 * Changed files between the previous assessment's commit and this one.
 *
 * Git already knows what changed, so this asks the host instead of re-reading
 * and hashing every source file on each run. File paths only — a depth-1 clone
 * cannot attribute who last touched a file.
 */
export async function resolveChanges(input: {
  previousHead: string | undefined;
  head: string | undefined;
  compare: CompareCommits;
}): Promise<ChangeSet> {
  const { previousHead, head, compare } = input;
  if (previousHead === undefined || head === undefined) return NOT_COMPARABLE;
  if (previousHead === head) {
    return { changes: [], removed: [], comparable: true };
  }

  const compared = await compare(previousHead, head);
  if (compared === null) return NOT_COMPARABLE;

  const changes = new Set<string>();
  const removed = new Set<string>();
  for (const entry of compared) {
    if (entry.removed) removed.add(entry.filePath);
    else changes.add(entry.filePath);
  }

  // Deletions belong to the change trail too: a commit that only removes files
  // must still record what changed in evidence and `changesSincePrevious`.
  return {
    changes: [...new Set([...changes, ...removed])]
      .sort((a, b) => a.localeCompare(b))
      .map((filePath) => ({ filePath })),
    removed: [...removed].sort(),
    comparable: true,
  };
}

export function summarizeChanges(changes: FileChange[]): string {
  if (changes.length === 0)
    return "No source changes since the previous assessment.";
  const files = changes.slice(0, 5).map((change) => change.filePath);
  const more = changes.length > 5 ? ` (+${changes.length - 5} more)` : "";
  return `${changes.length} file(s) changed: ${files.join(", ")}${more}`;
}
