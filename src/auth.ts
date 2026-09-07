import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";
import { isProductionRuntime, resolveAuthSecret } from "@/auth-secret";
import {
  assertProductionGitHubApp,
  githubAuthorizationScopes,
} from "@/server/github-app";
import {
  clearStoredGitHubToken,
  getStoredGitHubToken,
  storeUserGitHubToken,
} from "@/server/github-tokens";
import { ensurePersonalOrgProvisioned } from "@/server/personal-org";

/** True when GitHub OAuth env vars are present — otherwise sign-in is hidden. */
export function isGitHubAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_SECRET &&
      process.env.AUTH_GITHUB_ID &&
      process.env.AUTH_GITHUB_SECRET,
  );
}

/**
 * Fail loud when serving in production without AUTH_URL.
 * Skips the Next.js production-build phase so `next build` still works.
 */
function assertProductionAuthUrl(): void {
  if (!isProductionRuntime()) return;
  if (!isGitHubAuthConfigured()) return;
  if (!process.env.AUTH_URL) {
    throw new Error(
      "AUTH_URL is required in production when GitHub auth is configured (see docs/deploy.md).",
    );
  }
}

function assertProductionGitHubAuth(): void {
  assertProductionAuthUrl();
  assertProductionGitHubApp();
}

const githubConfigured = isGitHubAuthConfigured();
const authSecret = resolveAuthSecret();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: githubConfigured
    ? [
        GitHub({
          authorization: {
            params: { scope: githubAuthorizationScopes() },
          },
        }),
      ]
    : [],
  secret: authSecret,
  trustHost: true,
  events: {
    async signIn(message) {
      // Without a DB adapter, Auth.js mints a random UUID as `user.id`. Identity
      // in this app is GitHub's stable account id (same as jwt.sub).
      const account = message.account;
      if (account?.provider !== "github" || !account.providerAccountId) return;
      const userId = String(account.providerAccountId);
      const profile = message.profile;
      const githubLogin =
        profile &&
        typeof profile === "object" &&
        "login" in profile &&
        typeof profile.login === "string"
          ? profile.login
          : undefined;
      if (!githubLogin) return;
      await ensurePersonalOrgProvisioned(userId, githubLogin);
    },
    async signOut(message) {
      const token = "token" in message ? message.token : undefined;
      const sub =
        token && typeof token === "object" && typeof token.sub === "string"
          ? token.sub
          : undefined;
      if (sub) await clearStoredGitHubToken(sub);
    },
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      // Only enforce production GitHub App / AUTH_URL on fresh OAuth sign-in.
      // Decoding an existing session (including Playwright-minted JWTs) must not
      // throw JWTSessionError when App env is absent.
      if (account) {
        assertProductionGitHubAuth();
      }

      // Definitive identity: Auth.js v5 mints a random UUID as user.id on each
      // OAuth sign-in without a DB adapter. Always use GitHub's stable account
      // id so ownerUserId, memberships, and github_tokens stay aligned.
      if (account?.provider === "github" && account.providerAccountId) {
        token.sub = String(account.providerAccountId);
      }

      // Persist OAuth tokens server-side only — never embed in the JWT cookie.
      if (account?.access_token && typeof token.sub === "string") {
        await storeUserGitHubToken(token.sub, account.access_token);
      }

      if (profile && typeof profile === "object" && "login" in profile) {
        const login = profile.login;
        if (typeof login === "string") token.login = login;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        if (typeof token.login === "string") {
          session.user.login = token.login;
        }
      }
      return session;
    },
  },
});

/**
 * Reads the GitHub OAuth access token from encrypted server-side storage.
 * Server-only — never pass the result into client components.
 */
export async function getGitHubAccessToken(): Promise<string | null> {
  if (!isGitHubAuthConfigured()) return null;
  assertProductionGitHubAuth();
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  if (!cookieHeader) return null;

  const token = await getToken({
    req: { headers: { cookie: cookieHeader } },
    secret: resolveAuthSecret(),
    secureCookie: process.env.NODE_ENV === "production",
  });
  if (typeof token?.sub !== "string") return null;

  return getStoredGitHubToken(token.sub);
}
