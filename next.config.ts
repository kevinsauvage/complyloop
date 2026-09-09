import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

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
  // Dev-only: allow the ngrok tunnel host to fetch dev assets (403 otherwise).
  // Production ignores this setting.
  allowedDevOrigins: ["jaida-unapplausive-antonietta.ngrok-free.dev"],
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
