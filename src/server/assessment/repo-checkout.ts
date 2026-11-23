import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

import type { Project } from "@complyloop/analysis-core/contract/project-types";
import { PublicError } from "@complyloop/analysis-core/contract/public-error";

import { isE2EHarnessEnabled } from "../e2e-harness";
import {
  gitBasicAuthHeader,
  type GitHttpAuth,
  noGitHttpAuth,
} from "../github/git-http";
import {
  githubPublicCloneUrl,
  parseOwnerRepo,
  redactCloneUrl,
} from "../github/github";
import { requireProjectRepoAccess } from "../github/github-connector";
import { refForProjectCheckout } from "../github/tracked-branch";
import { withFixtureCheckout } from "./fixture-checkout";
import { assertCheckoutQuota } from "./monitor";

export interface RepoCheckoutOptions {
  fullName: string;
  accessToken: string;
  /** Optional git ref (branch, tag, or commit SHA) to check out after clone. */
  ref?: string;
}

/**
 * Validates an untrusted git ref before it reaches the git layer. Refs feed
 * isomorphic-git fetch/checkout (no shell, so no flag injection), but strict
 * validation still guards API misuse: only hex SHAs and strict branch/tag
 * names are accepted. Called by `withRepoCheckout`, the single sink for every
 * server checkout path. Note: short (non-40-hex) SHAs cannot be fetched by
 * hash — use the full SHA or a branch/tag name.
 */
export function parseCheckoutRef(ref: string): string {
  if (
    ref.length === 0 ||
    ref.length > 128 ||
    /[\x00-\x20\x7f\s]/.test(ref) ||
    ref.startsWith("-") ||
    ref.startsWith("/") ||
    ref.startsWith(".")
  ) {
    throw new PublicError("Invalid checkout ref.", "ref_not_found");
  }
  if (/^[0-9a-f]{4,64}$/i.test(ref)) return ref;
  if (
    /^[A-Za-z0-9._/-]+$/.test(ref) &&
    !ref.includes("..") &&
    !ref.includes("@{") &&
    !ref.endsWith("/") &&
    !ref.endsWith(".") &&
    !ref.endsWith(".lock")
  ) {
    return ref;
  }
  throw new PublicError("Invalid checkout ref.", "ref_not_found");
}

const CLONE_TIMEOUT_MS = 120_000;

/**
 * Shallow-clones a repo into `rootPath` with pure-JS git (no `git` CLI —
 * serverless runtimes don't ship one); removes the directory on failure.
 */
export async function cloneShallow(
  cloneUrl: string,
  rootPath: string,
  auth: GitHttpAuth = noGitHttpAuth(),
): Promise<void> {
  fs.mkdirSync(path.dirname(rootPath), { recursive: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const clone = git.clone({
      fs,
      http,
      dir: rootPath,
      url: cloneUrl,
      singleBranch: true,
      depth: 1,
      headers: auth.headers,
    });
    // A clone abandoned on timeout keeps running; its late failure must not
    // surface as an unhandled rejection after we cleaned up.
    clone.catch(() => {});
    await Promise.race([
      clone,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new PublicError(
                "git clone timed out — the repository may be unreachable or too large.",
                "connect",
              ),
            ),
          CLONE_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    fs.rmSync(rootPath, { recursive: true, force: true });
    if (error instanceof PublicError) throw error;
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new PublicError(
      `git clone failed: ${redactCloneUrl(detail).trim().slice(0, 400)}`,
      "connect",
    );
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Authenticated shallow clone for GitHub checkouts. The token travels
 * per-request in the HTTP `Authorization` header, never in the URL.
 */
export async function cloneAuthedShallow(
  publicUrl: string,
  accessToken: string,
  rootPath: string,
): Promise<void> {
  await cloneShallow(publicUrl, rootPath, gitBasicAuthHeader(accessToken));
}

/** Fetch failures that mean "no such ref" (vs network/auth failures). */
function isRefNotFoundError(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "NotFoundError"
  ) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /Could not find/i.test(message);
}

export { withFixtureCheckout } from "./fixture-checkout";

/**
 * Shallow-clones a GitHub repo into a temp directory, runs `fn`, then deletes
 * the tree. Worker-only: request handlers that need source read the one file
 * they touch through the contents API (`withProjectFileWorkspace`).
 */
export async function withRepoCheckout<T>(
  options: RepoCheckoutOptions,
  fn: (rootPath: string) => Promise<T>,
): Promise<T> {
  if (isE2EHarnessEnabled()) {
    return withFixtureCheckout(fn);
  }

  const ref =
    options.ref === undefined ? undefined : parseCheckoutRef(options.ref);
  const { fullName, accessToken } = options;
  parseOwnerRepo(fullName);
  // Start marker so a stall inside clone/fetch is visible in function logs.
  console.info(
    `[progress] checkout started repo=${fullName} ref=${ref ?? "default"}`,
  );
  const auth = gitBasicAuthHeader(accessToken);
  const rootPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "complyloop-checkout-"),
  );
  try {
    await cloneAuthedShallow(
      githubPublicCloneUrl(fullName),
      accessToken,
      rootPath,
    );
    if (ref) {
      // Ref fetches can pull more tree than the default shallow clone: fail
      // fast on quota before fetching instead of after. Full 40-hex SHAs
      // fetch by hash (verified against GitHub); branch/tag names resolve
      // server-side as usual.
      await assertCheckoutQuota(rootPath);
      try {
        await git.fetch({
          fs,
          http,
          dir: rootPath,
          ref,
          depth: 1,
          singleBranch: true,
          tags: false,
          headers: auth.headers,
        });
      } catch (error) {
        if (!isRefNotFoundError(error)) throw error;
        throw new PublicError(
          `Ref not found: ${ref}. The branch or commit may have been deleted.`,
          "ref_not_found",
        );
      }
      try {
        await git.checkout({ fs, dir: rootPath, ref });
      } catch {
        throw new PublicError(
          `Ref not found: ${ref}. The branch or commit may have been deleted.`,
          "ref_not_found",
        );
      }
    }
    // The post-checkout quota gate lives in the scan's own walk
    // (`assertCheckoutQuota` counts every file but `.git`, so a separate walk
    // here would re-enumerate the tree for nothing). The pre-fetch walk above
    // stays: it fails fast before a ref fetch can pull more tree than the
    // default shallow clone.
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
export { refForProjectCheckout } from "../github/tracked-branch";

export async function withProjectCheckout<T>(
  project: Project,
  fn: (rootPath: string) => Promise<T>,
  ref?: string,
): Promise<T> {
  if (isE2EHarnessEnabled()) {
    return withFixtureCheckout(fn);
  }

  const { fullName, accessToken } = await requireProjectRepoAccess(project);
  // No explicit ref (a manual run): the project's tracked branch when one is
  // set, otherwise the repository default.
  return withRepoCheckout(
    { fullName, accessToken, ref: refForProjectCheckout(project, ref) },
    fn,
  );
}
