import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";
import {
  assertE2EFixtureRoot,
  isE2EHarnessEnabled,
} from "./e2e-harness";
import { createGit } from "./git";
import {
  resolveProjectGitHubToken,
  type ResolveProjectGitHubTokenOptions,
} from "./github";
import { githubCloneUrl } from "./github-helpers";
import { assertCheckoutWithinQuota } from "./resource-limits";

export interface RepoCheckoutOptions {
  fullName: string;
  accessToken: string;
  /** Optional git ref (branch, tag, or commit SHA) to check out after clone. */
  ref?: string;
}

/** Shallow-clones into `rootPath`; removes the directory on clone failure. */
export async function cloneShallow(
  cloneUrl: string,
  rootPath: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(rootPath), { recursive: true });
  try {
    await createGit().clone(cloneUrl, rootPath, ["--depth", "1"]);
  } catch (error) {
    fs.rmSync(rootPath, { recursive: true, force: true });
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new PublicError(
      `git clone failed: ${detail.trim().slice(0, 400)}`,
      "connect",
    );
  }
}

/**
 * Copies the e2e fixture into a temp directory, runs `fn`, then deletes the tree.
 * Mutating the copy cannot affect the committed fixture.
 */
export async function withFixtureCheckout<T>(
  fn: (rootPath: string) => Promise<T>,
): Promise<T> {
  const fixtureRoot = assertE2EFixtureRoot();
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "complyloop-e2e-"));
  try {
    fs.cpSync(fixtureRoot, rootPath, { recursive: true });
    return await fn(rootPath);
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
}

/**
 * Shallow-clones a GitHub repo into a temp directory, runs `fn`, then deletes
 * the tree. Use for every server path that needs source (assess, webhook, PR).
 */
export async function withRepoCheckout<T>(
  options: RepoCheckoutOptions,
  fn: (rootPath: string) => Promise<T>,
): Promise<T> {
  if (isE2EHarnessEnabled()) {
    return withFixtureCheckout(fn);
  }

  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "complyloop-checkout-"));
  try {
    await cloneShallow(
      githubCloneUrl(options.fullName, options.accessToken),
      rootPath,
    );
    if (options.ref) {
      // Ref fetches can pull more tree than the default shallow clone: fail
      // fast on quota before fetching instead of after.
      assertCheckoutWithinQuota(rootPath);
      const git = createGit({ baseDir: rootPath });
      try {
        await git.fetch(["--depth", "1", "origin", options.ref]);
      } catch {
        // Shallow clone of default branch may already include the ref (e.g. push).
      }
      await git.checkout([options.ref]);
    }
    assertCheckoutWithinQuota(rootPath);
    return await fn(rootPath);
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
}

/**
 * Resolves a GitHub token for the project and runs work against an ephemeral
 * checkout of `github.fullName`. Under the e2e harness, uses the local fixture.
 */
export async function withProjectCheckout<T>(
  project: Project,
  fn: (rootPath: string) => Promise<T>,
  ref?: string,
  tokenOptions?: ResolveProjectGitHubTokenOptions,
): Promise<T> {
  if (isE2EHarnessEnabled()) {
    return withFixtureCheckout(fn);
  }

  const fullName = project.github?.fullName;
  if (!fullName) {
    throw new PublicError("Project has no GitHub repository metadata.", "connect");
  }
  const accessToken = await resolveProjectGitHubToken(project, tokenOptions);
  if (!accessToken) {
    throw new PublicError(
      project.github?.installationId
        ? "Could not mint a GitHub App installation token for this repository."
        : "No stored GitHub token for this session - sign out and sign in with GitHub again.",
      "connect",
    );
  }
  return withRepoCheckout({ fullName, accessToken, ref }, fn);
}
