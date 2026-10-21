import "server-only";

import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { applyEditToText } from "@/ai/patch-apply";
import type { FileEdit } from "@/ai/patch-types";

import { createOctokit, octokitErrorMessage, parseOwnerRepo } from "./github";

/**
 * Commit author for fix branches. A GitHub App installation has no ambient
 * git identity, so the commit identity is explicit.
 */
const FIX_COMMIT_AUTHOR = {
  name: "ComplyLoop",
  email: "complyloop@noreply.local",
};

/** Mode for every committed fix file. AST patches target text source files. */
const FIX_FILE_MODE = "100644" as const;

export interface FixBranchCommitOptions {
  fullName: string;
  accessToken: string;
  /** Branch to create or force-update with the fix commit. */
  branch: string;
  /** Base branch name: the fix commit's parent is its current tip. */
  base: string;
  message: string;
  edits: ReadonlyArray<FileEdit>;
}

export interface FixBranchCommitResult {
  branch: string;
  /** Branch the fix commit is based on — the tracked branch, or its fallback. */
  base: string;
  commitSha: string;
}

function errorStatus(error: unknown): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }
  return undefined;
}

/**
 * Reads a file at `ref`, failing loud on directories and files too large for
 * the contents API (GitHub omits `content` above ~1 MB). Patch targets are
 * bounded by the AI edit caps, so a missing payload means the candidate is
 * out of contract, not something to paper over.
 */
async function readFileText(
  octokit: ReturnType<typeof createOctokit>,
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
  fullName: string,
): Promise<string> {
  let data: Awaited<ReturnType<typeof octokit.rest.repos.getContent>>["data"];
  try {
    ({ data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref,
    }));
  } catch (error) {
    if (errorStatus(error) === 404) {
      throw new PublicError(
        `File not found in ${fullName} at \`${ref}\`: ${filePath}`,
        "connect",
      );
    }
    throw new PublicError(
      octokitErrorMessage(error, `Could not read ${filePath} from ${fullName}`),
      "connect",
    );
  }
  if (Array.isArray(data) || data.type !== "file") {
    throw new PublicError(`Not a file in ${fullName}: ${filePath}`, "connect");
  }
  if (data.encoding !== "base64" || typeof data.content !== "string") {
    throw new PublicError(
      `Could not read the full contents of ${filePath} (file too large?). Generate the patch again on a smaller module.`,
      "connect",
    );
  }
  return Buffer.from(data.content, "base64").toString("utf8");
}

/**
 * Resolves the base commit, falling back to the repository's live default
 * branch when a tracked branch was deleted server-side.
 */
async function resolveBaseCommit(
  octokit: ReturnType<typeof createOctokit>,
  owner: string,
  repo: string,
  base: string,
  fullName: string,
): Promise<{ branch: string; sha: string }> {
  const refSha = async (branch: string): Promise<string | null> => {
    try {
      const { data } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `refs/heads/${branch}`,
      });
      return data.object.sha;
    } catch (error) {
      if (errorStatus(error) === 404) return null;
      throw error;
    }
  };

  const baseSha = await refSha(base);
  if (baseSha) return { branch: base, sha: baseSha };

  const { data: repository } = await octokit.rest.repos.get({ owner, repo });
  const fallback = repository.default_branch;
  const fallbackSha = fallback ? await refSha(fallback) : null;
  if (!fallback || !fallbackSha) {
    throw new PublicError(
      `Base branch \`${base}\` does not exist in ${fullName}.`,
      "ref_not_found",
    );
  }
  return { branch: fallback, sha: fallbackSha };
}

/**
 * Paths among `paths` whose base-tree entry is executable. A recursive tree
 * read is one call when the repo is small enough; GitHub truncates the
 * listing on large repos, so a truncated result walks only the parent
 * directories of the files being committed.
 */
async function resolveExecutablePaths(
  octokit: ReturnType<typeof createOctokit>,
  owner: string,
  repo: string,
  rootTreeSha: string,
  paths: ReadonlyArray<string>,
): Promise<Set<string>> {
  const executable = new Set<string>();
  try {
    const { data } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: rootTreeSha,
      recursive: "1",
    });
    if (!data.truncated) {
      for (const entry of data.tree) {
        if (entry.type === "blob" && entry.path && entry.mode === "100755") {
          executable.add(entry.path);
        }
      }
      return executable;
    }
  } catch {
    // Fall back to the default file mode below.
    return executable;
  }

  const modeOf = async (filePath: string): Promise<string | undefined> => {
    const segments = filePath.split("/");
    let treeSha = rootTreeSha;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (!segment) return undefined;
      const { data } = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: treeSha,
      });
      const entry = data.tree.find((candidate) => candidate.path === segment);
      if (!entry) return undefined;
      if (index === segments.length - 1) return entry.mode;
      if (entry.type !== "tree" || !entry.sha) return undefined;
      treeSha = entry.sha;
    }
    return undefined;
  };

  for (const filePath of paths) {
    if ((await modeOf(filePath)) === "100755") executable.add(filePath);
  }
  return executable;
}

/**
 * Commits a verified patch through the GitHub Git Data API — no checkout, no
 * push. Each edit is validated against the base commit first, so a fix
 * generated from an older revision fails closed instead of overwriting
 * concurrent work. Retrying force-updates the existing fix branch, matching
 * the previous force-push behaviour after an orphaned remote branch.
 */
export async function commitFixBranch(
  options: FixBranchCommitOptions,
): Promise<FixBranchCommitResult> {
  const { owner, repo } = parseOwnerRepo(options.fullName);
  const octokit = createOctokit(options.accessToken);

  const base = await resolveBaseCommit(
    octokit,
    owner,
    repo,
    options.base,
    options.fullName,
  );
  const { data: baseCommit } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: base.sha,
  });

  const editsByPath = new Map<string, FileEdit[]>();
  for (const edit of options.edits) {
    const existing = editsByPath.get(edit.path) ?? [];
    existing.push(edit);
    editsByPath.set(edit.path, existing);
  }

  const changed: Array<{ path: string; sha: string }> = [];

  for (const [filePath, edits] of editsByPath) {
    const current = await readFileText(
      octokit,
      owner,
      repo,
      filePath,
      base.sha,
      options.fullName,
    );
    let next = current;
    for (const edit of edits) next = applyEditToText(next, edit);
    if (next === current) continue;

    const { data: blob } = await octokit.rest.git.createBlob({
      owner,
      repo,
      content: next,
      encoding: "utf-8",
    });
    changed.push({ path: filePath, sha: blob.sha });
  }

  if (changed.length === 0) {
    throw new PublicError(
      "No changes to commit — the verified patch does not change the file content.",
    );
  }

  // Preserve the executable bit: the contents API does not expose file modes.
  const executablePaths = await resolveExecutablePaths(
    octokit,
    owner,
    repo,
    baseCommit.tree.sha,
    changed.map((entry) => entry.path),
  );

  const tree = changed.map((entry) => ({
    path: entry.path,
    mode: executablePaths.has(entry.path) ? ("100755" as const) : FIX_FILE_MODE,
    type: "blob" as const,
    sha: entry.sha,
  }));

  const { data: newTree } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseCommit.tree.sha,
    tree,
  });
  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message: options.message,
    tree: newTree.sha,
    parents: [base.sha],
    author: FIX_COMMIT_AUTHOR,
    committer: FIX_COMMIT_AUTHOR,
  });

  // Create the branch, or reset it when a retry finds it already there
  // (same net effect as the previous force-push).
  try {
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${options.branch}`,
      sha: commit.sha,
    });
  } catch (error) {
    if (errorStatus(error) !== 422) throw error;
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `refs/heads/${options.branch}`,
      sha: commit.sha,
      force: true,
    });
  }

  return { branch: options.branch, base: base.branch, commitSha: commit.sha };
}

export interface OpenPullRequest {
  url: string;
  /** Base branch the open PR targets. */
  base: string;
}

/** Open PR for a head branch, or null when none exists. */
export async function openPullRequestUrl(options: {
  fullName: string;
  accessToken: string;
  head: string;
}): Promise<OpenPullRequest | null> {
  const { owner, repo } = parseOwnerRepo(options.fullName);
  const octokit = createOctokit(options.accessToken);
  try {
    const { data } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "open",
      head: `${owner}:${options.head}`,
      per_page: 1,
    });
    const pr = data[0];
    if (!pr?.html_url) return null;
    return { url: pr.html_url, base: pr.base.ref };
  } catch {
    return null;
  }
}

export async function createPullRequestViaApi(options: {
  fullName: string;
  accessToken: string;
  head: string;
  base: string;
  title: string;
  body: string;
}): Promise<string> {
  const { owner, repo } = parseOwnerRepo(options.fullName);
  const octokit = createOctokit(options.accessToken);
  try {
    const { data } = await octokit.rest.pulls.create({
      owner,
      repo,
      title: options.title,
      body: options.body,
      head: options.head,
      base: options.base,
      draft: true,
    });
    if (!data.html_url) throw new Error("GitHub PR API returned no html_url.");
    return data.html_url;
  } catch (error) {
    // Retry-safe: a second attempt after an orphan PR hits "already exists".
    // Reconcile by returning the open PR for this head branch instead — but
    // only when it targets the base we just committed against.
    const existing = await openPullRequestUrl({
      fullName: options.fullName,
      accessToken: options.accessToken,
      head: options.head,
    });
    if (existing?.base === options.base) return existing.url;
    throw new Error(octokitErrorMessage(error, "GitHub PR API failed"));
  }
}
