import "server-only";

import { isProductionRuntime } from "@/auth-secret";

import { assertProductionGitHubApp } from "./github-app";

/** GitHub OAuth client credentials plus the secret that signs sessions. */
export function isGitHubAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_SECRET &&
    process.env.AUTH_GITHUB_ID &&
    process.env.AUTH_GITHUB_SECRET,
  );
}

/**
 * Fail loud when serving in production with GitHub auth but no AUTH_URL or
 * App credentials. Skips the Next.js build phase so `next build` still works.
 */
export function assertProductionGitHubAuth(): void {
  if (!isProductionRuntime()) return;
  if (!isGitHubAuthConfigured()) return;
  if (!process.env.AUTH_URL) {
    throw new Error(
      "AUTH_URL is required in production when GitHub auth is configured (see docs/vercel.md).",
    );
  }
  assertProductionGitHubApp();
}
