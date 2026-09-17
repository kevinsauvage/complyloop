import "server-only";

import { cookies } from "next/headers";
import { getToken } from "next-auth/jwt";

import {
  isProductionRuntime,
  resolveAuthSecret,
  sessionCookieIsSecure,
} from "@/auth-secret";
import { assertProductionGitHubApp } from "@/server/github/github-app";
import {
  clearStoredGitHubToken,
  getStoredGitHubTokenWithExpiry,
  isTokenRefreshError,
  refreshGitHubToken,
} from "@/server/github/github-tokens";

/** Same env gate as `isGitHubAuthConfigured` in `@/auth` — kept local so the
 * token vault does not import the NextAuth composition root. */
function githubOAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_SECRET &&
    process.env.AUTH_GITHUB_ID &&
    process.env.AUTH_GITHUB_SECRET,
  );
}

/**
 * Fail loud when serving in production without AUTH_URL / GitHub App.
 * Skips the Next.js production-build phase so `next build` still works.
 */
function assertProductionGitHubAuth(): void {
  if (!isProductionRuntime()) return;
  if (!githubOAuthConfigured()) return;
  if (!process.env.AUTH_URL) {
    throw new Error(
      "AUTH_URL is required in production when GitHub auth is configured (see docs/vercel.md).",
    );
  }
  assertProductionGitHubApp();
}

/**
 * Token-state signal for repair UI. `revoked` (grant revoked/expired at
 * GitHub) wants a "reconnect" banner; `missing` (no row, transient refresh
 * failure, or undecryptable row) wants the generic sign-in hint. The stored
 * row is cleared only on `revoked` — transient failures keep it for retry.
 */
export type GitHubTokenState =
  | { state: "valid"; token: string }
  | { state: "revoked" }
  | { state: "missing" };

export async function getGitHubAccessTokenState(): Promise<GitHubTokenState> {
  if (!githubOAuthConfigured()) return { state: "missing" };
  assertProductionGitHubAuth();
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  if (!cookieHeader) return { state: "missing" };

  const token = await getToken({
    req: { headers: { cookie: cookieHeader } },
    secret: resolveAuthSecret(),
    secureCookie: sessionCookieIsSecure(),
  });
  if (typeof token?.sub !== "string") return { state: "missing" };

  const stored = await getStoredGitHubTokenWithExpiry(token.sub);
  if (!stored) return { state: "missing" };

  if (
    stored.expiresAt &&
    new Date(stored.expiresAt) <= new Date() &&
    stored.refreshToken
  ) {
    try {
      const refreshed = await refreshGitHubToken({
        userId: token.sub,
        refreshToken: stored.refreshToken,
      });
      return { state: "valid", token: refreshed.accessToken };
    } catch (error) {
      if (isTokenRefreshError(error) && error.reason === "revoked") {
        await clearStoredGitHubToken(token.sub);
        return { state: "revoked" };
      }
      return { state: "missing" };
    }
  }

  return { state: "valid", token: stored.accessToken };
}

/**
 * Reads the GitHub OAuth access token from encrypted server-side storage.
 * Server-only — never pass the result into client components.
 *
 * Returns null when the user has no stored token. Throws a PublicError with
 * code `github_token_unreadable` when a stored row exists but cannot be
 * decrypted — callers should surface that message (it tells the user to
 * reconnect) rather than treating it as "not connected".
 */
export async function getGitHubAccessToken(): Promise<string | null> {
  const state = await getGitHubAccessTokenState();
  return state.state === "valid" ? state.token : null;
}
