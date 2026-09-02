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
    include: ["src/**/*.test.{ts,tsx}", "packages/analysis-core/src/**/*.test.{ts,tsx}"],
    // Assessment / temp-fs tests can exceed 5s under parallel load.
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      // Product / domain surface — Postgres loaders and Playwright browser driver
      // are exercised by integration suites and excluded from unit thresholds.
      include: [
        "src/core/**",
        "src/adapters/**",
        "src/ai/**",
        "src/hooks/**",
        "src/server/**",
        "packages/analysis-core/src/**",
      ],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "packages/analysis-core/src/**/*.test.{ts,tsx}",
        "src/server/db-store/**",
        "packages/analysis-core/src/runtime/scan.ts",
        // Thin Next Auth / cookie / workspace glue — covered via e2e.
        "src/server/active-cookies.ts",
        "src/server/workspace.ts",
        "src/server/db.ts",
        // Live GitHub/git checkout I/O — e2e + fixture paths cover the contract.
        "src/server/repo-checkout.ts",
        "src/server/github-tokens.ts",
        "src/server/github-app.ts",
        "src/server/octokit.ts",
        "src/server/github.ts",
        "src/server/connect-github.ts",
        "src/server/pr.ts",
        "src/server/webhook-deliveries.ts",
        "src/server/github-repo.ts",
        // Markdown report assembly — HTML covered by report-html.ts tests.
        "src/server/report.ts",
        // Verify paths mix AST + Playwright DOM re-check; unit suite covers the AST/manual branches.
        "src/server/actions/remediation-verify.ts",
      ],
      thresholds: {
        lines: 96,
        functions: 96,
        branches: 85,
        statements: 94,
      },
    },
  },
});
