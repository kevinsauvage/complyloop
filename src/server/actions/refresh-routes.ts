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
  "/dashboard",
  "/findings",
  "/requirements",
  "/evidence",
] as const;
