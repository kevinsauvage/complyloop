import "server-only";

import { createOctokit, parseOwnerRepo } from "./github";

/** One path reported by a commit comparison. */
export interface ChangedPath {
  filePath: string;
  /** The path is gone at `head` — deleted, or the old side of a rename. */
  removed: boolean;
}

/**
 * GitHub lists at most 300 changed files, all on the first page (later pages
 * only page through commits). A list that reaches the cap may be truncated.
 */
const COMPARE_FILE_LIMIT = 300;

/**
 * Files that differ between two commits (GitHub compare API).
 *
 * Returns `null` when the range cannot be compared — `base` is not an ancestor
 * of `head` (a force-push or a rewritten branch), an API failure, or as many
 * changed files as GitHub will list — which callers must read as "scan the
 * whole tree", never as "nothing changed".
 */
export async function compareCommitFiles(options: {
  fullName: string;
  accessToken: string;
  base: string;
  head: string;
}): Promise<ChangedPath[] | null> {
  const { owner, repo } = parseOwnerRepo(options.fullName);
  const octokit = createOctokit(options.accessToken);
  try {
    const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
      owner,
      repo,
      basehead: `${options.base}...${options.head}`,
      // Only the commit list pages; one commit keeps the response small.
      per_page: 1,
    });
    // Three dots diff from the merge base. When `base` is not an ancestor of
    // `head` ("behind"/"diverged"), files only the old commit touched would be
    // missing, and their findings would never be re-checked.
    if (data.status !== "ahead" && data.status !== "identical") return null;
    const files = data.files;
    // `files` is omitted when GitHub will not list the diff (too large).
    if (files === undefined || files.length >= COMPARE_FILE_LIMIT) return null;
    const changed: ChangedPath[] = [];
    for (const file of files) {
      if (file.status === "removed") {
        changed.push({ filePath: file.filename, removed: true });
      } else if (file.status === "renamed") {
        // Both sides matter: findings recorded against the old path must be
        // invalidated, and the new path is what the scan reads.
        if (file.previous_filename) {
          changed.push({ filePath: file.previous_filename, removed: true });
        }
        changed.push({ filePath: file.filename, removed: false });
      } else {
        changed.push({ filePath: file.filename, removed: false });
      }
    }
    return changed;
  } catch {
    // Not an error state: the caller falls back to a full scan.
    return null;
  }
}
