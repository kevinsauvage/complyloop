/**
 * Schema/code drift for the ops check.
 *
 * The app queries columns and indexes that migrations create, so a checkout
 * whose `drizzle/*.sql` are not applied to the database 500s on the first page
 * that touches them (`column "started_at" does not exist`) instead of saying
 * what is wrong. Migrations only run automatically on production deploys
 * (`scripts/vercel-build.mjs`), so every dev/preview database and any deploy
 * that shipped ahead of its migration needs this check.
 */
export interface MigrationDrift {
  /** Present in this checkout's `drizzle/`, not recorded in the database. */
  pending: string[];
  /**
   * Recorded in the database, absent from this checkout — the database is
   * ahead of the code (an older checkout, or a rolled-back deploy). Not fatal:
   * extra columns are harmless to older code.
   */
  unknown: string[];
}

/** Compares migration files in the checkout against `_complyloop_migrations`. */
export function migrationDrift(
  localFiles: readonly string[],
  appliedIds: readonly string[],
): MigrationDrift {
  const applied = new Set(appliedIds);
  const local = new Set(localFiles);
  return {
    pending: localFiles.filter((file) => !applied.has(file)),
    unknown: appliedIds.filter((id) => !local.has(id)),
  };
}
