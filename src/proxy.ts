import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import { resolveAuthSecret, sessionCookieIsSecure } from "@/auth-secret";
import { safeCallbackUrl } from "@/core/callback-url";

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

/**
 * Per-request Content-Security-Policy with a nonce. Next.js parses the
 * `Content-Security-Policy` **request** header and stamps the nonce onto the
 * framework/page scripts it renders, so the pages it protects must be
 * dynamically rendered — they are (every HTML route is `ƒ` in the build; only
 * `robots.txt`/`sitemap.xml` are static and the matcher skips dotted paths).
 *
 * Dev is relaxed on purpose: React needs `'unsafe-eval'` to reconstruct
 * server stacks, and Turbopack HMR opens a `ws:` socket. `style-src` keeps
 * `'unsafe-inline'` because Radix primitives position with inline style
 * attributes, which a nonce cannot cover (styles are a lower-risk surface than
 * scripts). `img-src` allows GitHub avatars; `connect-src 'self'` covers
 * server actions, polling, and the Sentry tunnel (`/monitoring`). No
 * `upgrade-insecure-requests` — HSTS already forces HTTPS, and it would break
 * the http e2e/`next start` runs.
 */
function buildContentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://avatars.githubusercontent.com",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  ].join("; ");
}

/** Continue to the page, exposing the nonce to SSR and the CSP to the browser. */
function nextWithCsp(request: NextRequest, nonce: string): NextResponse {
  const csp = buildContentSecurityPolicy(nonce);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
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

  // API routes own their auth (webhook secret, session cookies) and return
  // JSON, not a browser document — no CSP, and no per-request nonce needed.
  if (pathname.startsWith("/api/")) return;

  const nonce = btoa(crypto.randomUUID());

  // Private-preview gate: HTTP Basic Auth on every page. Evaluated *before*
  // the GitHub-auth early return so a deployment with `BASIC_AUTH_*` set but
  // `AUTH_*` unset is still gated (never fails open). API routes above keep
  // their own auth (webhook secret, session cookies), and browsers cache the
  // Basic credential per origin so in-app fetch calls reuse it. Unset
  // credentials = gate open (local dev).
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

  if (!isGitHubAuthConfigured()) return nextWithCsp(req, nonce);

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
    dashboardUrl.pathname = safeCallbackUrl(
      req.nextUrl.searchParams.get("callbackUrl"),
    );
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return nextWithCsp(req, nonce);
}

export const config = {
  // The Sentry tunnel (/monitoring) must match so the branch above can strip
  // the cached Basic credential before the rewrite forwards to ingest —
  // excluding it would pass `authorization` through and Sentry would 400 with
  // `invalid project key`. Static assets and files with extensions stay out.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
