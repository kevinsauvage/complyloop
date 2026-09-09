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
  // Standalone output is for the Docker image only — `next start` warns/fails
  // when standalone is always on (Playwright e2e uses `npm run start`).
  ...(process.env.DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),
  // Runtime analysis engines use dynamic requires Playwright/Node APIs; keep them
  // out of the Turbopack graph (same rationale as disk-loaded axe.min.js).
  serverExternalPackages: [
    "linkinator",
    "playwright",
    "axe-core",
    "html-validate",
  ],
  transpilePackages: [
    "@complyloop/analysis-core",
    "@complyloop/analysis-core/contract",
    "@complyloop/db",
    "@complyloop/adapters",
  ],
  // Pin the workspace root so Turbopack ignores lockfiles above this directory.
  turbopack: {
    root: __dirname,
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
