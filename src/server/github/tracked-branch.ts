/**
 * The branch ComplyLoop treats as a project's truth: the explicitly tracked
 * branch when one is set, otherwise the repository's default branch.
 */
export function effectiveBranch(
  github:
    | { defaultBranch?: string | undefined; trackedBranch?: string | undefined }
    | undefined,
): string | undefined {
  return github?.trackedBranch || github?.defaultBranch || undefined;
}

/**
 * Ref a project checkout or file read uses: an explicit one (a webhook job's
 * SHA) wins; otherwise the project's tracked branch; otherwise `undefined`
 * (the repository's default branch).
 *
 * Git-free on purpose: request handlers import this without pulling
 * isomorphic-git into their bundle.
 */
export function refForProjectCheckout(
  project: { github?: { trackedBranch?: string | undefined } | undefined },
  ref?: string,
): string | undefined {
  return ref ?? project.github?.trackedBranch;
}
