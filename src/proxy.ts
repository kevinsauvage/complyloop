import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  resolveAuthSecret,
  sessionCookieIsSecure,
} from "@/auth-secret";

const PUBLIC_PATHS = new Set(["/", "/login"]);

function isGitHubAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_SECRET &&
      process.env.AUTH_GITHUB_ID &&
      process.env.AUTH_GITHUB_SECRET,
  );
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return pathname.startsWith("/legal/");
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

  if (isLoggedIn && pathname === "/login") {
    const dashboardUrl = req.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
