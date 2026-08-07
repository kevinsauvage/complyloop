import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Project } from "@/core/types";
import { cloneShallow, githubCloneUrl } from "./connect-shared";
import { ConnectError } from "./connect-url";
import { createGit } from "./git";
import { resolveProjectGitHubToken } from "./github-access";

export interface RepoCheckoutOptions {
  fullName: string;
  accessToken: string;
  /** Optional git ref (branch, tag, or commit SHA) to check out after clone. */
  ref?: string;
}

/**
 * Shallow-clones a GitHub repo into a temp directory, runs `fn`, then deletes
 * the tree. Use for every server path that needs source (assess, webhook, PR).
 */
export async function withRepoCheckout<T>(
  options: RepoCheckoutOptions,
  fn: (rootPath: string) => Promise<T>,
): Promise<T> {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "complyloop-checkout-"));
  try {
    await cloneShallow(
      githubCloneUrl(options.fullName, options.accessToken),
      rootPath,
    );
    if (options.ref) {
      const git = createGit({ baseDir: rootPath });
      try {
        await git.fetch(["--depth", "1", "origin", options.ref]);
      } catch {
        // Shallow clone of default branch may already include the ref (e.g. push).
      }
      await git.checkout([options.ref]);
    }
    return await fn(rootPath);
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
}

/**
 * Resolves a GitHub token for the project and runs work against an ephemeral
 * checkout of `github.fullName`.
 */
export async function withProjectCheckout<T>(
  project: Project,
  fn: (rootPath: string) => Promise<T>,
  ref?: string,
): Promise<T> {
  const fullName = project.github?.fullName;
  if (!fullName) {
    throw new ConnectError("Project has no GitHub repository metadata.");
  }
  const accessToken = await resolveProjectGitHubToken(project);
  if (!accessToken) {
    throw new ConnectError(
      project.github?.installationId
        ? "Could not mint a GitHub App installation token for this repository."
        : "No stored GitHub token for project owner — sign in again to refresh the token.",
    );
  }
  return withRepoCheckout({ fullName, accessToken, ref }, fn);
}
