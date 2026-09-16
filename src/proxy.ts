import { type NextRequest, NextResponse } from "next/server";
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

function basicAuthCredentials(): {
  username: string;
  password: string;
} | null {
  const username = process.env.BASIC_AUTH_USERNAME?.trim();
  const password = process.env.BASIC_AUTH_PASSWORD ?? "";
  if (!username || !password) return null;
  return { username, password };
}

/** Constant-time comparison without node:crypto (unavailable on edge). */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

function isBasicAuthSatisfied(
  header: string | null,
  expected: { username: string; password: string },
): boolean {
  if (!header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length).trim());
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  return (
    timingSafeEqualString(decoded.slice(0, separator), expected.username) &&
    timingSafeEqualString(decoded.slice(separator + 1), expected.password)
  );
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // Sentry browser-tunnel route (tunnelRoute: "/monitoring" in next.config.ts).
  // The tunnel is a Next rewrite that forwards the request — headers included —
  // to Sentry ingest. If the private-preview Basic credential cached by the
  // browser is attached, Sentry reads `authorization` as DSN auth and rejects
  // the envelope with 400 `invalid project key`
  // (getsentry/sentry-javascript#8341). Strip it here — never gate or redirect
  // the tunnel. This branch runs before everything else so it also applies
  // when GitHub auth is unconfigured.
  if (pathname === "/monitoring" || pathname.startsWith("/monitoring/")) {
    if (req.headers.has("authorization")) {
      const headers = new Headers(req.headers);
      headers.delete("authorization");
      return NextResponse.next({ request: { headers } });
    }
    return;
  }

  if (!isGitHubAuthConfigured()) return;

  if (pathname.startsWith("/api/")) return;

  // Private-preview gate: HTTP Basic Auth on every page. API routes above
  // keep their own auth (webhook secret, cron Bearer, session cookies), and
  // browsers cache the Basic credential per origin so in-app fetch calls
  // reuse it. Unset credentials = gate open (local dev).
  const basicAuth = basicAuthCredentials();
  if (
    basicAuth &&
    !isBasicAuthSatisfied(req.headers.get("authorization"), basicAuth)
  ) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="ComplyLoop", charset="UTF-8"',
      },
    });
  }

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
  // The Sentry tunnel (/monitoring) must match so the branch above can strip
  // the cached Basic credential before the rewrite forwards to ingest —
  // excluding it would pass `authorization` through and Sentry would 400 with
  // `invalid project key`. Static assets and files with extensions stay out.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
