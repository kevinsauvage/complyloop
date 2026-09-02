import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { ANON_STATE, OWNER_STATE, VIEWER_STATE } from "./e2e/auth";
import { resolveE2EAuthSecret } from "./e2e/env";

const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
const fixtureRoot = path.join(process.cwd(), "e2e", "fixtures", "sample-app");
const authSecret = resolveE2EAuthSecret();

const e2eEnv: Record<string, string> = {
  ...process.env,
  PORT: String(port),
  // Force the same secret used to mint cookies (globalSetup does not load .env.local).
  AUTH_SECRET: authSecret,
  AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID ?? "e2e",
  AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET ?? "e2e",
  AUTH_URL: baseURL,
  E2E_AUTH_ENABLED: "1",
  E2E_FIXTURE_ROOT: process.env.E2E_FIXTURE_ROOT ?? fixtureRoot,
  // GitHub webhook HMAC secret — the spec signs deliveries with the same value.
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET ?? "e2e-webhook-secret",
  // Point Octokit at a local fixture so PR Check Run posting is exercised end-to-end.
  GITHUB_API_BASE_URL:
    process.env.GITHUB_API_BASE_URL ??
    `http://127.0.0.1:${process.env.E2E_MOCK_GITHUB_PORT ?? "4109"}`,
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgres://complyloop:complyloop@localhost:5433/complyloop",
};

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "public",
      testMatch: /public\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: ANON_STATE,
      },
    },
    {
      name: "owner",
      testMatch:
        /routes\.spec\.ts|core-loop\.spec\.ts|compliance-loops\.spec\.ts|a11y\.spec\.ts|org-account\.spec\.ts|settings\.spec\.ts|evidence-export\.spec\.ts|webhook\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: OWNER_STATE,
      },
    },
    {
      name: "viewer",
      testMatch: /authz\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: VIEWER_STATE,
      },
    },
  ],
  webServer: {
    command: "npm run db:migrate && npm run e2e:seed && npm run build && npm run start",
    url: baseURL,
    // Always start a dedicated server so e2e env (harness, DB) cannot leak from
    // an unrelated `next dev` / `next start` already bound to the port.
    reuseExistingServer: process.env.PW_REUSE === "1",
    timeout: 600_000,
    env: e2eEnv,
  },
});
