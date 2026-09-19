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
  // Same for `axe-core/axe.min.js`: the remediation-verify re-checks run
  // inside finding-page actions, so only a global
  // include keeps them working in production.
  // `@sparticuz/chromium` stays in `serverExternalPackages` above (never
  // bundled) but its `bin/*.br` binaries are no longer force-included
  // anywhere: the only consumer was the deleted Vercel worker route, and
  // the GitHub Actions executor resolves the package from `node_modules`.
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/playwright-core/browsers.json",
      "./node_modules/axe-core/axe.min.js",
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
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "kevin-6c",

  project: "javascript-nextjs",

  // Explicit so a missing token fails loudly at build time instead of
  // silently skipping source-map upload (plugin also reads the env var).
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
