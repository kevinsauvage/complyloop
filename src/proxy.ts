import { type NextRequest,NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import {
  resolveAuthSecret,
  sessionCookieIsSecure,
} from "@/auth-secret";

const PUBLIC_PATHS = new Set(["/", "/login"]);

// Intentionally duplicated from `@/auth` (same env-var check) instead of
// importing it: `auth.ts` pulls NextAuth providers, DB clients, and GitHub
// token helpers into the proxy bundle. Keep this file on `next/server` +
// `next-auth/jwt` + `@/auth-secret` only.
function isGitHubAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_SECRET &&
      process.env.AUTH_GITHUB_ID &&
      process.env.AUTH_GITHUB_SECRET,
  );
}

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isPublicPath(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  if (PUBLIC_PATHS.has(normalized)) return true;
  return normalized === "/legal" || normalized.startsWith("/legal/");
}

// Mirror login page + auth action validation: internal path only,
// no protocol-relative open redirect. Falls back to /dashboard so
// deep links survive the /login bounce without breaking back behavior.
function toSafeCallbackUrl(value: string | null): string {
  if (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
  ) {
    return value;
  }
  return "/dashboard";
}

export async function proxy(req: NextRequest) {
  if (!isGitHubAuthConfigured()) return;

  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) return;

  const token = await getToken({
    req,
    secret: resolveAuthSecret(),
    // Must mirror how Auth.js chose the cookie name at sign-in time (https
    // AUTH_URL ⇒ __Secure- prefix), not NODE_ENV — see sessionCookieIsSecure.
    secureCookie: sessionCookieIsSecure(),
  });
  const isLoggedIn = Boolean(token);
  const isPublic = isPublicPath(pathname);

  if (!isLoggedIn && !isPublic) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const callbackUrl = `${pathname}${search}`;
    if (callbackUrl !== "/") {
      loginUrl.searchParams.set("callbackUrl", callbackUrl);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && normalizePath(pathname) === "/login") {
    const dashboardUrl = req.nextUrl.clone();
    dashboardUrl.pathname = toSafeCallbackUrl(
      req.nextUrl.searchParams.get("callbackUrl"),
    );
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
