import { defineConfig } from "vitest/config";

/** Pack/install smoke — rebuilds @complyloop/check; run via `npm run test:check-pack`. */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["packages/check/src/check-pack.smoke.test.ts"],
    testTimeout: 120_000,
  },
});
