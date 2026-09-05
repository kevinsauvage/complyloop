import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Project } from "@complyloop/domain/project-types";
import { cloneShallow, githubCloneUrl } from "./connect-shared";
import { ConnectError } from "./connect-error";
import {
  assertE2EFixtureRoot,
  isE2EHarnessEnabled,
} from "./e2e-harness";
import { createGit } from "./git";
import {
  resolveProjectGitHubToken,
  type ResolveProjectGitHubTokenOptions,
} from "./github-access";
import { assertCheckoutWithinQuota } from "./resource-limits";

export interface RepoCheckoutOptions {
  fullName: string;
  accessToken: string;
  /** Optional git ref (branch, tag, or commit SHA) to check out after clone. */
  ref?: string;
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
    throw new ConnectError("Project has no GitHub repository metadata.");
  }
  const accessToken = await resolveProjectGitHubToken(project, tokenOptions);
  if (!accessToken) {
    throw new ConnectError(
      project.github?.installationId
        ? "Could not mint a GitHub App installation token for this repository."
        : "No stored GitHub token for this session - sign out and sign in with GitHub again.",
    );
  }
  return withRepoCheckout({ fullName, accessToken, ref }, fn);
}
