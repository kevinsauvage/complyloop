import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const domIncludes = [
  "src/components/**/*.test.{ts,tsx}",
  "src/hooks/**/*.test.ts",
  "src/app/**/*.test.tsx",
  "packages/analysis-core/src/runtime/site-level/snapshot.test.ts",
  "packages/analysis-core/src/runtime/custom-checks/*.test.ts",
];

const unitIncludes = [
  "src/**/*.test.{ts,tsx}",
  "packages/analysis-core/src/**/*.test.{ts,tsx}",
  "packages/db/src/**/*.test.{ts,tsx}",
  "e2e/**/*.test.ts",
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws under its `default` export condition; unit tests run
    // outside React Server Components, so resolve the package's empty server
    // entry instead. Production enforcement is unchanged (Next sets
    // `react-server` for RSC and fails client imports at build time).
    alias: [
      {
        find: /^server-only$/,
        replacement: fileURLToPath(
          new URL("./vitest.server-only-stub.js", import.meta.url),
        ),
      },
    ],
  },
  test: {
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
      ],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "packages/analysis-core/src/**/*.test.{ts,tsx}",
        "packages/db/src/**/*.test.{ts,tsx}",
        // Type modules — named types by repo convention (*-types, types
        // barrels), no executable logic worth covering.
        "**/*-types.ts",
        "**/types.ts",
        "**/*.d.ts",
        // Runtime scan driver — exercised by test:e2e (needs a repo + browsers).
        "packages/analysis-core/src/runtime/scan.ts",
        // Playwright page probes — unit job has no Chromium, so these skip.
        "packages/analysis-core/src/runtime/custom-checks/**",
        // HTML-validate runtime probe — covered by test:e2e browser runs.
        "packages/analysis-core/src/runtime/html-validate-runtime.ts",
        // Scan applicability gating — covered by test:e2e assessment runs.
        "packages/analysis-core/src/runtime/applicability.ts",
        // Live link checker (network) — covered by test:e2e.
        "packages/analysis-core/src/runtime/site-level/link-check.ts",
        // Live Postgres wiring without a default-suite unit driver — test:db.
        "packages/db/src/postgres.ts", // test:db (postgres client + connection handling)
        "packages/db/src/schema.ts", // test:db (schema declarations only)
        "packages/db/src/workspace-load.ts", // test:db (workspace.integration.test.ts)
        "packages/db/src/repo/**", // test:db (query layer; pure helpers have unit tests)
        "packages/db/src/test-fixtures/**", // test support files, no product logic
        // Write path covered by workspace.test.ts + workspace.integration.test.ts (test:db).
        "src/server/workspace/workspace.ts", // test:db
        // Page loaders (findings/dashboard/requirements/evidence views) — Postgres
        // reads composed for RSC pages; covered via test:e2e page runs.
        "src/server/workspace/project-view.ts", // test:e2e
        "src/server/workspace/findings-view.ts", // test:e2e
        "src/server/workspace/finding-detail-view.ts", // test:e2e
        "src/server/workspace/requirements-view.ts", // test:e2e
        "src/server/workspace/evidence-view.ts", // test:e2e
        "src/server/workspace/dashboard-view.ts", // test:e2e
        "src/server/workspace/settings-view.ts", // test:e2e
        "src/server/workspace/active-project-page.ts", // test:e2e
        // Reporting loaders (needs Postgres); covered via test:e2e page runs.
        "src/server/reporting/evidence-queries.ts", // test:e2e
        "src/server/reporting/nav-attention.ts", // test:e2e
        // Thin Next Auth / cookie glue — covered via test:e2e.
        "src/server/workspace/active-cookies.ts", // test:e2e
        "src/server/workspace/db.ts", // test:e2e
        // Live GitHub/git checkout I/O — e2e + fixture paths cover the contract.
        "src/server/github/access-token.ts", // test:e2e (cookie + token vault I/O)
        "src/server/github/github-access.ts", // test:e2e (thin auth glue)
        "src/server/assessment/repo-checkout.ts", // test:e2e
        "src/server/github/github-tokens.ts", // test:e2e
        "src/server/github/github-app.ts", // test:e2e
        "src/server/octokit.ts", // test:e2e
        "src/server/workspace/connect-github.ts", // test:e2e
        "src/server/github-repo.ts", // test:e2e
        // Report loader (needs Postgres); input builder is unit-covered by
        // report.test.ts and renderers by report-html/report.test.ts.
        "src/server/reporting/report.ts", // test:db (loadReportInput) + unit (reportInputForProject)
      ],
      thresholds: {
        lines: 94,
        functions: 96,
        branches: 80,
        statements: 90,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          setupFiles: ["./vitest.setup.ts"],
          include: unitIncludes,
          exclude: [...domIncludes],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: domIncludes,
        },
      },
    ],
  },
});
