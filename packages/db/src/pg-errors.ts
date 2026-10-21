/**
 * Postgres error helpers for the write paths.
 *
 * postgres.js throws raw errors with `.code`, but drizzle wraps query errors
 * (`DrizzleQueryError`), so the pg code can sit one — or, after nested
 * wrapping, several — levels down the `cause` chain. Callers must not assume a
 * single level: a job-claim race or a duplicate idempotency key that reads as
 * "generic failure" is retried forever instead of being handled.
 */

const MAX_CAUSE_DEPTH = 8;

/** True when `error` (or any wrapped cause) is a Postgres unique violation. */
export function isUniqueViolation(error: unknown): boolean {
  return hasPgCode(error, "23505");
}

/** True when `error` (or any wrapped cause) carries the given SQLSTATE code. */
export function hasPgCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ("code" in current && current.code === code) return true;
    if (!("cause" in current)) return false;
    current = current.cause;
  }
  return false;
}
