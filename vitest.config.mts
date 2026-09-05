import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "packages/analysis-core/src/**/*.test.{ts,tsx}",
      "packages/db/src/**/*.test.{ts,tsx}",
      "packages/domain/src/**/*.test.{ts,tsx}",
      "packages/adapters/src/**/*.test.{ts,tsx}",
    ],
    // Assessment / temp-fs tests can exceed 5s under parallel load.
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      // Product / domain surface — Postgres loaders and Playwright browser driver
      // are exercised by integration suites and excluded from unit thresholds.
      include: [
        "src/core/**",
        "src/ai/**",
        "src/hooks/**",
        "src/server/**",
        "packages/analysis-core/src/**",
        "packages/db/src/**",
        "packages/domain/src/**",
        "packages/adapters/src/**",
      ],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "packages/analysis-core/src/**/*.test.{ts,tsx}",
        "packages/db/src/**/*.test.{ts,tsx}",
        "packages/domain/src/**/*.test.{ts,tsx}",
        "packages/adapters/src/**/*.test.{ts,tsx}",
        "packages/analysis-core/src/runtime/scan.ts",
        // Playwright page probes — unit job has no Chromium, so these skip.
        "packages/analysis-core/src/runtime/custom-checks/**",
        "packages/analysis-core/src/runtime/html-validate-runtime.ts",
        "packages/analysis-core/src/runtime/applicability.ts",
        "packages/analysis-core/src/runtime/dom-target.ts",
        "packages/analysis-core/src/runtime/site-level/link-check.ts",
        "src/server/seed.ts",
        // Thin Next Auth / cookie / workspace glue — covered via e2e.
        "src/server/active-cookies.ts",
        "src/server/workspace.ts",
        "src/server/db.ts",
        // Live GitHub/git checkout I/O — e2e + fixture paths cover the contract.
        "src/server/repo-checkout.ts",
        "src/server/github-tokens.ts",
        "src/server/github-app.ts",
        "src/server/octokit.ts",
        "src/server/connect-github.ts",
        "src/server/github-repo.ts",
        // Markdown report assembly — HTML covered by report-html.ts tests.
        "src/server/report.ts",
        // Live Postgres wiring without a default-suite unit driver.
        "packages/db/src/client.ts",
        "packages/db/src/schema.ts",
        "packages/db/src/workspace-load.ts",
        "packages/db/src/postgres-url.ts",
        "packages/db/src/postgres-queries.ts",
        "packages/db/src/write-lock.ts",
        "packages/db/src/repo/**",
      ],
      thresholds: {
        lines: 94,
        functions: 96,
        branches: 80,
        statements: 90,
      },
    },
  },
});
