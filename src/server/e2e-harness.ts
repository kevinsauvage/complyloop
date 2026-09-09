import fs from "node:fs";
import path from "node:path";

/**
 * Acknowledgement that a production-mode server is the Playwright harness, not
 * a real deployment. Set ONLY by `playwright.config.ts` on its dedicated
 * `next start` server — never on a real deployment.
 */
const E2E_PROD_HARNESS = "E2E_PROD_HARNESS";

/**
 * True when the Playwright e2e harness env is explicitly enabled.
 *
 * Fail-fast: in `NODE_ENV=production` the harness requires `E2E_PROD_HARNESS=1`
 * (which only Playwright sets). Without it we throw instead of silently
 * swapping real GitHub checkouts for a local fixture tree, skipping
 * production GitHub App enforcement, and running assessment jobs in-request.
 */
export function isE2EHarnessEnabled(): boolean {
  if (process.env.E2E_AUTH_ENABLED !== "1") return false;
  if (
    process.env.NODE_ENV === "production" &&
    process.env[E2E_PROD_HARNESS] !== "1"
  ) {
    throw new Error(
      "E2E_AUTH_ENABLED=1 is set in production without E2E_PROD_HARNESS=1. " +
        "Unset E2E_AUTH_ENABLED — the harness swaps real GitHub checkouts for a " +
        "local fixture tree, skips production GitHub App enforcement, and runs " +
        "assessment jobs in-request. (Playwright sets E2E_PROD_HARNESS=1 on its " +
        "own server; see playwright.config.ts. Never set it on a real deployment.)",
    );
  }
  return true;
}

/**
 * Returns the absolute fixture root when the harness is enabled.
 * Throws when enabled without a usable `E2E_FIXTURE_ROOT`.
 */
export function assertE2EFixtureRoot(): string {
  if (!isE2EHarnessEnabled()) {
    throw new Error("E2E harness is not enabled.");
  }
  const raw = process.env.E2E_FIXTURE_ROOT?.trim();
  if (!raw) {
    throw new Error(
      "E2E_AUTH_ENABLED=1 requires E2E_FIXTURE_ROOT (absolute path to fixture source).",
    );
  }
  const root = path.resolve(raw);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`E2E_FIXTURE_ROOT is not a directory: ${root}`);
  }
  return root;
}
