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
