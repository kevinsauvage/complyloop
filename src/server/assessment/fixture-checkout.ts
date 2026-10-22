import "server-only";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { assertE2EFixtureRoot } from "../e2e-harness";

/**
 * Copies the e2e fixture into a temp directory, runs `fn`, then deletes the
 * tree. Mutating the copy cannot affect the committed fixture.
 *
 * Lives apart from `repo-checkout` so request handlers that only need a
 * single-file workspace (patch generation) do not pull pure-JS git into
 * their bundle.
 */
export async function withFixtureCheckout<T>(
  fn: (rootPath: string) => Promise<T>,
): Promise<T> {
  const fixtureRoot = assertE2EFixtureRoot();
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "complyloop-e2e-"));
  try {
    fs.cpSync(fixtureRoot, rootPath, { recursive: true });
    return await fn(rootPath);
  } finally {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
}
