export function slugifyOrgName(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned.length > 0 ? cleaned : "org";
}

/** Picks an unused slug from a read-only org list (does not mutate). */
export function uniqueOrgSlug(
  db: { organizations: ReadonlyArray<{ slug: string }> },
  base: string,
): string {
  if (!db.organizations.some((org) => org.slug === base)) return base;
  let index = 2;
  while (db.organizations.some((org) => org.slug === `${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}
