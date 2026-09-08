import { nextUniqueSlug, slugifyOrgName } from "@complyloop/db/org-slug";

export { slugifyOrgName };

/** Picks an unused slug from a read-only org list (does not mutate). */
export function uniqueOrgSlug(
  db: { organizations: ReadonlyArray<{ slug: string }> },
  base: string,
): string {
  return nextUniqueSlug(base, new Set(db.organizations.map((o) => o.slug)));
}
