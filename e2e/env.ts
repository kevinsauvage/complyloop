/**
 * Auth secret used for Playwright session cookies and the e2e webServer.
 * Defaults to a fixed dummy — Playwright globalSetup does not load `.env.local`,
 * so relying on AUTH_SECRET from that file is unreliable. Override with
 * E2E_AUTH_SECRET if you need a custom value (must match webServer AUTH_SECRET).
 */
export function resolveE2EAuthSecret(): string {
  return resolveSecret("E2E_AUTH_SECRET", "e2e-secret");
}

export function resolveSecret(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

/** Local e2e Postgres (docker-compose port 5433) — shared by config + helpers. */
export const E2E_DEFAULT_DATABASE_URL =
  "postgres://complyloop:complyloop@localhost:5433/complyloop";

/**
 * Database URL the e2e harness may use — and may destructively `db:migrate` +
 * `e2e:seed` (TRUNCATE … CASCADE) against, via the webServer command.
 *
 * Deliberately does NOT fall back to `DATABASE_URL`: that variable points at a
 * shared/staging/production database in real environments, and an implicit
 * fallback would let `npm run test:e2e` wipe it. A non-default target must be
 * named explicitly in `E2E_DATABASE_URL`, or opted into with
 * `E2E_ALLOW_DATABASE_URL=1` (e.g. a CI service container exported only as
 * `DATABASE_URL`). Everything else resolves to the local docker default.
 */
export function resolveE2EDatabaseUrl(): string {
  const explicit = process.env.E2E_DATABASE_URL?.trim();
  if (explicit) return explicit;
  if (process.env.E2E_ALLOW_DATABASE_URL?.trim() === "1") {
    const opted = process.env.DATABASE_URL?.trim();
    if (opted) return opted;
  }
  return E2E_DEFAULT_DATABASE_URL;
}
