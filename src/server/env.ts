/**
 * Central server environment access. All reads are lazy functions (never
 * module constants) so builds, tests (`vi.stubEnv`), and edge-safe imports
 * never observe a stale snapshot — and nothing throws at import time.
 *
 * Scope: server-owned keys only. Framework keys (`NODE_ENV`, `NEXT_*`) stay
 * direct at their use sites, and `AUTH_*` stays with `src/auth.ts` /
 * `src/proxy.ts` / token cryptography, which also run outside `server-only`
 * contexts (middleware, edge) that must not pull this module in.
 */
import "server-only";

function trimmed(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw ? raw : undefined;
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function githubAppId(): string | undefined {
  return trimmed("GITHUB_APP_ID");
}

export function githubAppSlug(): string | undefined {
  return trimmed("GITHUB_APP_SLUG");
}

export function githubAppPrivateKey(): string | undefined {
  return trimmed("GITHUB_APP_PRIVATE_KEY");
}

export function githubApiBaseUrl(): string | undefined {
  return trimmed("GITHUB_API_BASE_URL");
}

export function githubWebhookSecret(): string | undefined {
  return trimmed("GITHUB_WEBHOOK_SECRET");
}

/** Vercel AI Gateway key; unset means AI features stay unavailable. */
export function aiGatewayApiKey(): string | undefined {
  return trimmed("AI_GATEWAY_API_KEY");
}

/**
 * Vercel AI Gateway model id (`provider/model`). Overridable per deploy;
 * defaults to the free-tier model. `src/ai` reads `process.env.AI_MODEL`
 * directly (it must stay free of `@/server/*` imports) — this getter is the
 * server-side accessor for the same var.
 */
export function aiModel(): string {
  return trimmed("AI_MODEL") ?? "poolside/laguna-s-2.1-free";
}

export function supportEmail(): string | null {
  return trimmed("COMPLYLOOP_SUPPORT_EMAIL") ?? null;
}

export function appUrl(): string | undefined {
  return trimmed("NEXT_PUBLIC_APP_URL") ?? trimmed("AUTH_URL") ?? undefined;
}

export function e2eAuthEnabled(): boolean {
  return process.env.E2E_AUTH_ENABLED === "1";
}

export function e2eProdHarnessAcknowledged(): boolean {
  return process.env.E2E_PROD_HARNESS === "1";
}

export function e2eFixtureRoot(): string | undefined {
  return trimmed("E2E_FIXTURE_ROOT");
}

export function nodeEnv(): string | undefined {
  return process.env.NODE_ENV;
}

export function assessmentCheckoutQuota(): {
  maxBytes: number;
  maxFiles: number;
  scanTimeoutMs: number;
} {
  return {
    maxBytes: positiveInt("ASSESSMENT_MAX_CHECKOUT_BYTES", 500 * 1024 * 1024),
    maxFiles: positiveInt("ASSESSMENT_MAX_CHECKOUT_FILES", 50_000),
    scanTimeoutMs: positiveInt("ASSESSMENT_MAX_CHECKOUT_SCAN_MS", 30_000),
  };
}
