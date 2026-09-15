import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

/**
 * Normalize ALLOWED_DEV_ORIGINS to the bare-host form Next.js matches
 * against (see `allowedDevOrigins` docs): trim, lowercase, strip an
 * `http(s)://` scheme and any path/query. Wildcards (`*.example.com`)
 * pass through untouched.
 */
function parseAllowedDevOrigins(value: string | undefined): string[] {
  if (!value) return [];
  const hosts: string[] = [];
  for (const raw of value.split(",")) {
    const host = raw
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      ?.trim();
    if (host) hosts.push(host);
  }
  return hosts;
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
  // `@sparticuz/chromium` ships its binaries as non-JS `bin/*.br` assets with
  // the same tracing blind spot (`The input directory
  // ".../@sparticuz/chromium/bin" does not exist`). 66 MB, so it is scoped to
  // exactly the routes that launch a browser: scans run in `after()`
  // continuations of the invoking route — the Cron batch, the webhook drain,
  // and the two pages whose Server Actions scan (`/dashboard` runs
  // assessments, `/findings/*` re-verifies findings).
  outputFileTracingIncludes: {
    "/*": ["./node_modules/playwright-core/browsers.json"],
    "/api/internal/jobs/run": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/github/webhook": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/dashboard": ["./node_modules/@sparticuz/chromium/bin/**/*"],
    "/findings/*": ["./node_modules/@sparticuz/chromium/bin/**/*"],
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
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
