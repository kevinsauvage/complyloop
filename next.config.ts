// `@sentry/nextjs/config` is the non-deprecated entry point; the root export
// warns and stops working in @sentry/nextjs v11.
import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

/**
 * Normalize ALLOWED_DEV_ORIGINS to the bare-host form Next.js matches
 * against (see `allowedDevOrigins` docs): trim, lowercase, strip an
 * `http(s)://` scheme and any path/query. Wildcards (`*.example.com`)
 * pass through untouched.
 */

function parseAllowedDevOrigins(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((raw) =>
      raw
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .split("/")[0]
        ?.trim(),
    )
    .filter((host): host is string => Boolean(host));
}

const nextConfig: NextConfig = {
  // Don't leak framework fingerprinting via `X-Powered-By` (production
  // security checklist in node_modules/next/dist/docs).
  poweredByHeader: false,
  // NOTE: `cacheComponents` is intentionally off. Enabling it is not a
  // rename-only change — it requires adopting the Cache Components model
  // (`use cache` + `<Suspense>` around every uncached/dynamic read). All
  // authenticated routes here are `force-dynamic` today; see the Caching
  // guide before opting in.
  // Runtime analysis engines use dynamic requires Playwright/Node APIs; keep them
  // out of the Turbopack graph (same rationale as disk-loaded axe.min.js).
  // `isomorphic-git` and `@sparticuz/chromium` are serverless-safe pure-JS /
  // external-binary paths — same treatment so bundling never touches them.
  serverExternalPackages: [
    "linkinator",
    "playwright-core",
    "@sparticuz/chromium",
    "isomorphic-git",
    "axe-core",
    "html-validate",
  ],
  // `playwright-core` reads its `browsers.json` registry at load time, but
  // file tracing only follows JS imports — on Vercel the JSON never made it
  // into the function bundle (`Cannot find module .../browsers.json`, surfaced
  // as generic "Runtime scan failed."). 1 KB, so it goes to every route.
  // Only `browsers.json` is included here. The old `/*` include of
  // `axe-core/axe.min.js` was dropped: the runtime audit runs on the GitHub
  // Actions executor, so no Vercel function loads it, yet the `/*` glob pulled
  // axe-core into all 24 functions (~17 MB of Deployment Storage per
  // deployment). The executor resolves it from `node_modules` and ignores this
  // config entirely.
  outputFileTracingIncludes: {
    "/*": ["./node_modules/playwright-core/browsers.json"],
  },
  // Belt-and-braces guard: no Vercel-reachable module imports the runtime scan
  // stack anymore (remediation verify moved to the `verify_remediation`
  // worker job), so chromium/playwright must never be traced into a function.
  // These excludes keep the ~80 MB out of every function's trace even if a
  // future import re-introduces reachability — the two small includes above
  // are unaffected (different paths). The trailing `*` also matches the
  // hashed external-package staging dirs Turbopack emits
  // (`node_modules/playwright-core-<hash>`), which a bare `/` path misses.
  // The GitHub Actions executor resolves both packages from `node_modules`
  // and ignores this config entirely.
  // Runtime-audit engines are worker-only (GitHub Actions executor). Nothing
  // Vercel-reachable imports them at runtime, but they are still traced into
  // the functions that reach the worker graph, so they are excluded here too.
  outputFileTracingExcludes: {
    "/*": [
      "./node_modules/@sparticuz/chromium*",
      "./node_modules/playwright-core*",
      "./node_modules/axe-core*",
      "./node_modules/html-validate*",
      "./node_modules/linkinator*",
    ],
  },
  transpilePackages: [
    "@complyloop/analysis-core",
    "@complyloop/analysis-core/contract",
    "@complyloop/db",
  ],
  // Pin the workspace root so Turbopack ignores lockfiles above this directory.
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // The consolidated `radix-ui` barrel is not in Next's default list; rewrite
    // it to per-primitive imports so unused primitives are not bundled.
    optimizePackageImports: ["radix-ui"],
  },
  // Dev-only: allow tunnel hosts to fetch dev assets (403 otherwise).
  // Production ignores this setting. Set ALLOWED_DEV_ORIGINS="host1,host2".
  // Entries are normalized to bare hosts (scheme/path stripped, lowercased),
  // so full URLs paste safely. Use a wildcard ("*.ngrok-free.dev") — ngrok
  // free subdomains change on every restart.
  allowedDevOrigins: parseAllowedDevOrigins(process.env.ALLOWED_DEV_ORIGINS),
  // Baseline hardening with zero app-behavior change: framing, MIME sniffing,
  // TLS, referrer, and device APIs. Deliberately no script/style CSP —
  // Next.js, Turbopack HMR, and the Sentry tunnel rely on inline scripts.
  async headers() {
    const securityHeaders = [
      {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains",
      },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      {
        key: "Content-Security-Policy",
        value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
      },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, {
  org: "kevin-6c",

  project: "javascript-nextjs",

  // Explicit so a missing token fails loudly at build time instead of
  // silently skipping source-map upload (plugin also reads the env var).
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
