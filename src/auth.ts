import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { getToken } from "next-auth/jwt";
import { cookies } from "next/headers";
import {
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

const githubConfigured = isGitHubAuthConfigured();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: githubConfigured
    ? [
        GitHub({
          authorization: {
            params: { scope: "read:user user:email repo" },
          },
        }),
      ]
    : [],
  secret: process.env.AUTH_SECRET ?? "dev-only-auth-secret-not-for-production",
  trustHost: true,
  callbacks: {
    jwt({ token, account, profile }) {
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
