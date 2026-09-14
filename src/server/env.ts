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

/** GitHub App id for installation tokens (`github-app.ts`). */
export function githubAppId(): string | undefined {
  return trimmed("GITHUB_APP_ID");
}

/** GitHub App slug for the installation URL. */
export function githubAppSlug(): string | undefined {
  return trimmed("GITHUB_APP_SLUG");
}

/** GitHub App private key (PEM) for installation tokens. */
export function githubAppPrivateKey(): string | undefined {
  return trimmed("GITHUB_APP_PRIVATE_KEY");
}

/** Enterprise/custom GitHub API base URL (github.com by default). */
export function githubApiBaseUrl(): string | undefined {
  return trimmed("GITHUB_API_BASE_URL");
}

/** Webhook HMAC secret for delivery verification. */
export function githubWebhookSecret(): string | undefined {
  return trimmed("GITHUB_WEBHOOK_SECRET");
}

/** Vercel AI Gateway key; unset means AI features stay unavailable. */
export function aiGatewayApiKey(): string | undefined {
  return trimmed("AI_GATEWAY_API_KEY");
}

/** Support email shown on the org page (null when unconfigured). */
export function supportEmail(): string | null {
  return trimmed("COMPLYLOOP_SUPPORT_EMAIL") ?? null;
}

/** Public app URL for sitemaps/absolute links. */
export function appUrl(): string | undefined {
  return (
    trimmed("NEXT_PUBLIC_APP_URL") ?? trimmed("AUTH_URL") ?? undefined
  );
}

/** Playwright harness master switch (see `e2e-harness.ts`). */
export function e2eAuthEnabled(): boolean {
  return process.env.E2E_AUTH_ENABLED === "1";
}

/** Playwright acknowledgement for production-mode harness servers. */
export function e2eProdHarnessAcknowledged(): boolean {
  return process.env.E2E_PROD_HARNESS === "1";
}

/** Absolute fixture tree root for harness checkouts. */
export function e2eFixtureRoot(): string | undefined {
  return trimmed("E2E_FIXTURE_ROOT");
}

/** Current runtime environment (`development` | `production` | `test`). */
export function nodeEnv(): string | undefined {
  return process.env.NODE_ENV;
}

/** Ephemeral checkout quotas (see `assessment/repo-checkout.ts`). */
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
