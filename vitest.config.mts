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
    include: ["src/**/*.test.{ts,tsx}"],
    // Assessment / temp-fs tests can exceed 5s under parallel load.
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      // Scoped to launch-risk modules with real behavioral suites.
      include: [
        "src/core/**",
        "src/server/action-state.ts",
        "src/server/webhook.ts",
        "src/server/webhook-deliveries.ts",
        "src/analysis/runtime/url-safety.ts",
        "src/app/api/github/webhook/route.ts",
        "src/components/org-account-overview.tsx",
        "src/components/org-data-lifecycle.tsx",
        "src/server/actions/org.ts",
        "src/server/actions/assessment.ts",
        "src/server/actions/remediation.ts",
        "src/server/actions/remediation-verify.ts",
        "src/server/actions/remediation-dismiss.ts",
        "src/server/actions/requirements.ts",
        "src/server/actions/shared.ts",
      ],
      thresholds: {
        lines: 65,
        functions: 65,
        branches: 50,
        statements: 65,
      },
    },
  },
});
