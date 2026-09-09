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
import { resolveProjectGitHubToken } from "./github-access";
import { githubCloneUrl } from "./github";

function positiveEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function maxCheckoutBytes(): number {
  return positiveEnv("ASSESSMENT_MAX_CHECKOUT_BYTES", 500 * 1024 * 1024);
}

function maxCheckoutFiles(): number {
  return positiveEnv("ASSESSMENT_MAX_CHECKOUT_FILES", 50_000);
}

/** Rejects oversized clones before AST parsing or Playwright can consume capacity. */
export function assertCheckoutWithinQuota(rootPath: string): void {
  const byteLimit = maxCheckoutBytes();
  const fileLimit = maxCheckoutFiles();
  let bytes = 0;
  let files = 0;
  const pending = [rootPath];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      files += 1;
      bytes += fs.statSync(absolute).size;
      if (files > fileLimit || bytes > byteLimit) {
        throw new PublicError(
          `Repository exceeds the assessment quota (${fileLimit} files or ${Math.floor(byteLimit / 1024 / 1024)} MB).`,
          "assessment_quota_exceeded",
        );
      }
    }
  }
}

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
        throw new PublicError(
          `Ref not found: ${options.ref}. The branch or commit may have been deleted.`,
          "ref_not_found",
        );
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
 * Resolves a GitHub App installation token for the project and runs work
 * against an ephemeral checkout of `github.fullName`. Under the e2e harness,
 * uses the local fixture.
 */
export async function withProjectCheckout<T>(
  project: Project,
  fn: (rootPath: string) => Promise<T>,
  ref?: string,
): Promise<T> {
  if (isE2EHarnessEnabled()) {
    return withFixtureCheckout(fn);
  }

  const fullName = project.github?.fullName;
  if (!fullName) {
    throw new PublicError("Project has no GitHub repository metadata.", "connect");
  }
  const accessToken = await resolveProjectGitHubToken(project);
  if (!accessToken) {
    throw new PublicError(
      project.github?.installationId
        ? "Could not mint a GitHub App installation token for this repository."
        : "This project is not connected via the GitHub App. Reconnect it from Settings.",
      "connect",
    );
  }
  return withRepoCheckout({ fullName, accessToken, ref }, fn);
}
