import "server-only";

import fs from "node:fs";
import path from "node:path";

import git, { type StatusRow } from "isomorphic-git";
import http from "isomorphic-git/http/node";

import {
  type Finding,
  type Remediation,
} from "@complyloop/analysis-core/contract/entities";
import { isSourceLocation } from "@complyloop/analysis-core/contract/location";
import type {
  Control,
  Project,
} from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { applyFileEdits, type PatchCandidate } from "@/ai/verified-fix";

import { buildDeveloperHandoff } from "../assessment/handoff";
import { withProjectCheckout } from "../assessment/repo-checkout";
import { reportError } from "../observability";
import { gitBasicAuthHeader } from "./git-http";
import {
  createOctokit,
  githubPublicCloneUrl,
  octokitErrorMessage,
  parseOwnerRepo,
} from "./github";
import { resolveProjectGitHubToken } from "./github-access";

/**
 * Commit author for fix branches. Pure-JS git has no ambient
 * `user.name`/`user.email` config to fall back on (and ephemeral checkouts
 * ship none), so the identity is explicit — unlike the old CLI path, which
 * silently depended on whatever global gitconfig the host happened to have.
 */
const FIX_COMMIT_AUTHOR = {
  name: "ComplyLoop",
  email: "complyloop@noreply.local",
};

export interface PullRequestResult {
  branch: string;
  title: string;
  prUrl: string | null;
  message: string;
}

async function createPullRequestViaApi(options: {
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
    // Reconcile by returning the open PR for this head branch instead.
    const existing = await openPullRequestUrl({
      fullName: options.fullName,
      accessToken: options.accessToken,
      head: options.head,
    });
    if (existing) return existing;
    throw new Error(octokitErrorMessage(error, "GitHub PR API failed"));
  }
}

/** Open PR URL for a head branch, or null when none exists. */
async function openPullRequestUrl(options: {
  fullName: string;
  accessToken: string;
  head: string;
}): Promise<string | null> {
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
    return data[0]?.html_url ?? null;
  } catch {
    return null;
  }
}

/**
 * True when the working tree has no changes. A status-matrix row is
 * `[path, HEAD, workdir, stage]`; a clean tree has all three OID slots equal
 * (tracked-unmodified `[1,1,1]`; anything else — modified, staged, untracked,
 * deleted — breaks the equality).
 */
function isCleanStatusMatrix(matrix: StatusRow[]): boolean {
  return matrix.every(
    ([, head, workdir, stage]) => head === workdir && workdir === stage,
  );
}

/**
 * Apply an already verified patch candidate on a fresh checkout, then commit,
 * push, and open a draft PR via the GitHub REST API. Pure-JS git throughout:
 * no `git` CLI exists on serverless.
 */
export async function preparePullRequest(
  project: Project,
  control: Control,
  finding: Finding,
  remediation: Remediation,
  candidate: PatchCandidate | null,
): Promise<PullRequestResult> {
  const location = finding.location;
  if (!isSourceLocation(location)) {
    throw new PublicError(
      "Runtime DOM and site findings cannot be committed automatically — open a manual PR from the handoff text.",
    );
  }
  if (!candidate?.complyLoop.passed || candidate.edits.length === 0) {
    throw new PublicError(
      "Generate and review a ComplyLoop-verified patch before creating a draft pull request.",
    );
  }

  return withProjectCheckout(project, async (rootPath) => {
    if (!fs.existsSync(path.join(rootPath, ".git"))) {
      throw new PublicError(
        "Pull request preparation requires a git repository at the project root.",
      );
    }

    const shortId = finding.id.slice(0, 8);
    const branch = `complyloop/fix-${finding.checkId}-${shortId}`;
    const currentBranch = await git.currentBranch({ fs, dir: rootPath });

    const handoff = buildDeveloperHandoff(
      project,
      control,
      finding,
      remediation,
      rootPath,
    );
    const pullRequestBody = `${handoff.body}\n\n## Candidate verification\n\n- ComplyLoop: passed\n- Repository tests run in GitHub CI.`;

    try {
      const branches = await git.listBranches({ fs, dir: rootPath });
      if (branches.includes(branch)) {
        await git.checkout({ fs, dir: rootPath, ref: branch });
      } else {
        await git.branch({ fs, dir: rootPath, ref: branch, checkout: true });
      }

      const changedPaths = applyFileEdits(rootPath, candidate.edits);
      const matrix = await git.statusMatrix({ fs, dir: rootPath });
      if (isCleanStatusMatrix(matrix)) {
        throw new PublicError(
          `No changes to commit on branch \`${branch}\` — the verified patch did not alter the working tree.`,
        );
      }

      for (const filepath of changedPaths) {
        await git.add({ fs, dir: rootPath, filepath });
      }
      await git.commit({
        fs,
        dir: rootPath,
        message: `${handoff.title}\n\nGenerated by ComplyLoop. Verify with the automated check before merge.`,
        author: FIX_COMMIT_AUTHOR,
      });
    } catch (error) {
      let restored = true;
      try {
        if (currentBranch) {
          await git.checkout({ fs, dir: rootPath, ref: currentBranch });
        }
      } catch {
        restored = false;
      }
      if (error instanceof PublicError) {
        throw restored
          ? error
          : new PublicError(
              `${error.message} (also failed to restore branch \`${currentBranch}\`)`,
            );
      }
      reportError(error, { code: "prepare_pull_request" });
      throw new PublicError(
        restored
          ? `Failed to prepare pull request on branch \`${branch}\`.`
          : `Failed to prepare pull request on branch \`${branch}\`. (also failed to restore branch \`${currentBranch}\`)`,
      );
    }

    let prUrl: string | null = null;
    let message = `Branch \`${branch}\` created with the fix committed. Push and open a PR from the developer handoff.`;

    const fullName = project.github?.fullName;
    const token = await resolveProjectGitHubToken(project);

    // No silent fall-through: without a token nothing is pushed and the
    // ephemeral checkout is discarded, so claiming a "created branch"
    // below would describe a branch that exists nowhere.
    if (!fullName || !token) {
      throw new PublicError(
        "GitHub token unavailable — reconnect the repository, then retry. Nothing was pushed.",
      );
    }

    if (fullName && token) {
      // Token travels per-request in the HTTP Authorization header, never in
      // a URL or child-process env.
      const { headers } = gitBasicAuthHeader(token);
      const remote = githubPublicCloneUrl(fullName);
      try {
        // Force-push: each action runs on a fresh shallow clone, so a retry
        // after an orphan remote branch would otherwise be non-fast-forward.
        await git.push({
          fs,
          http,
          dir: rootPath,
          url: remote,
          ref: branch,
          remoteRef: branch,
          force: true,
          headers,
        });
        const base = project.github?.defaultBranch || "main";
        prUrl =
          (await openPullRequestUrl({
            fullName,
            accessToken: token,
            head: branch,
          })) ??
          (await createPullRequestViaApi({
            fullName,
            accessToken: token,
            head: branch,
            base,
            title: handoff.title,
            body: pullRequestBody,
          }));
        message = `Draft pull request created via GitHub API: ${prUrl}`;
      } catch (error) {
        reportError(error, { code: "prepare_pull_request" });
        throw new PublicError(
          `Branch \`${branch}\` was committed locally but push or opening the draft PR failed.`,
        );
      }
    }

    return {
      branch,
      title: handoff.title,
      prUrl,
      message,
    };
  });
}
