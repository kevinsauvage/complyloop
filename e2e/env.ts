/**
 * Auth secret used for Playwright session cookies and the e2e webServer.
 * Defaults to a fixed dummy — Playwright globalSetup does not load `.env.local`,
 * so relying on AUTH_SECRET from that file is unreliable. Override with
 * E2E_AUTH_SECRET if you need a custom value (must match webServer AUTH_SECRET).
 */
export function resolveE2EAuthSecret(): string {
  return resolveSecret("E2E_AUTH_SECRET", "e2e-secret");
}

/** Trimmed `process.env[name]`, or `fallback` when unset/blank. */
export function resolveSecret(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

/** Local e2e Postgres (docker-compose port 5433) — shared by config + helpers. */
export const E2E_DEFAULT_DATABASE_URL =
  "postgres://complyloop:complyloop@localhost:5433/complyloop";
