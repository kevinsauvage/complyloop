/**
 * App routes whose content derives from findings, remediations, requirements or
 * evidence. Mutations in the triage loop revalidate only these instead of the
 * whole app layout (see `refresh` in `./shared`), so unrelated dynamic routes
 * (project settings, `/org`, marketing) are not refetched.
 *
 * Project pages are dynamic, so they are listed as route patterns: one
 * `revalidatePath(pattern, "page")` covers every project, which is the intended
 * blast radius — a triage write can change the cross-project dashboard too.
 *
 * Kept out of `./shared` so action tests that mock that module don't have to
 * provide this constant.
 */
export const COMPLIANCE_LOOP_ROUTES = [
  // The cross-project dashboard aggregates the same rows (open violations,
  // unread regressions, last assessment), so a triage write stales it too.
  "/projects",
  "/projects/[projectId]/dashboard",
  "/projects/[projectId]/findings",
  "/projects/[projectId]/requirements",
  "/projects/[projectId]/evidence",
] as const;
