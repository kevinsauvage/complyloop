/**
 * App routes whose content derives from findings, remediations, requirements or
 * evidence. Mutations in the triage loop revalidate only these instead of the
 * whole app layout (see `refresh` in `./shared`), so unrelated `force-dynamic`
 * routes (`/settings`, `/org`, `/connect`, marketing) are not refetched.
 *
 * Kept out of `./shared` so action tests that mock that module don't have to
 * provide this constant.
 */
export const COMPLIANCE_LOOP_ROUTES = [
  // The cross-project dashboard aggregates the same rows (open violations,
  // unread regressions, last assessment), so a triage write stales it too.
  "/projects",
  "/dashboard",
  "/findings",
  "/requirements",
  "/evidence",
] as const;
