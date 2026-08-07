import fs from "node:fs";
import path from "node:path";

/** True when Playwright e2e harness env is explicitly enabled. */
export function isE2EHarnessEnabled(): boolean {
  return process.env.E2E_AUTH_ENABLED === "1";
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

/** No-op when harness is off; validates fixture when on. */
export function assertE2EHarnessSafe(): void {
  if (!isE2EHarnessEnabled()) return;
  assertE2EFixtureRoot();
}
