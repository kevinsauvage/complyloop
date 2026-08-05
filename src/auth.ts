import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";
import {
  clearStoredGitHubToken,
  getStoredGitHubToken,
  storeUserGitHubToken,
} from "@/server/github-tokens";

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
export function assertProductionAuthUrl(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!isGitHubAuthConfigured()) return;
  if (!process.env.AUTH_URL) {
    throw new Error(
      "AUTH_URL is required in production when GitHub auth is configured (see docs/deploy.md).",
    );
  }
}

const githubConfigured = isGitHubAuthConfigured();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: githubConfigured
    ? [
        GitHub({
          authorization: {
            // `repo` is required for private clones, PR create, and Check Runs.
            // Prefer a GitHub App with least privilege when leaving the laptop demo.
            params: { scope: "read:user user:email repo" },
          },
        }),
      ]
    : [],
  secret: process.env.AUTH_SECRET ?? "dev-only-auth-secret-not-for-production",
  trustHost: true,
  events: {
    async signOut(message) {
      const token = "token" in message ? message.token : undefined;
      const sub =
        token && typeof token === "object" && typeof token.sub === "string"
          ? token.sub
          : undefined;
      if (sub) clearStoredGitHubToken(sub);
    },
  },
  callbacks: {
    jwt({ token, account, profile }) {
      assertProductionAuthUrl();
      if (account?.access_token) {
        token.accessToken = account.access_token;
        if (token.sub) {
          storeUserGitHubToken(token.sub, account.access_token);
        }
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
 * Reads the GitHub OAuth access token from the encrypted JWT cookie.
 * Server-only — never pass the result into client components.
 */
export async function getGitHubAccessToken(): Promise<string | null> {
  if (!isGitHubAuthConfigured()) return null;
  assertProductionAuthUrl();
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
  if (!cookieHeader) return null;

  const token = await getToken({
    req: { headers: { cookie: cookieHeader } },
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
  });
  if (typeof token?.accessToken === "string") return token.accessToken;
  if (typeof token?.sub === "string") {
    return getStoredGitHubToken(token.sub);
  }
  return null;
}
