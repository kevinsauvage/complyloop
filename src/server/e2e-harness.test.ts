import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertE2EFixtureRoot, isE2EHarnessEnabled } from "./e2e-harness";

const previousEnabled = process.env.E2E_AUTH_ENABLED;
const previousRoot = process.env.E2E_FIXTURE_ROOT;
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (previousEnabled === undefined) delete process.env.E2E_AUTH_ENABLED;
  else process.env.E2E_AUTH_ENABLED = previousEnabled;
  if (previousRoot === undefined) delete process.env.E2E_FIXTURE_ROOT;
  else process.env.E2E_FIXTURE_ROOT = previousRoot;
});

describe("e2e harness", () => {
  it("is off unless E2E_AUTH_ENABLED=1", () => {
    delete process.env.E2E_AUTH_ENABLED;
    expect(isE2EHarnessEnabled()).toBe(false);
  });

  it("fails loud when enabled without fixture root", () => {
    process.env.E2E_AUTH_ENABLED = "1";
    delete process.env.E2E_FIXTURE_ROOT;
    expect(isE2EHarnessEnabled()).toBe(true);
    expect(() => assertE2EFixtureRoot()).toThrow(/E2E_FIXTURE_ROOT/);
  });

  it("resolves an existing fixture directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-fixture-"));
    tempDirs.push(root);
    process.env.E2E_AUTH_ENABLED = "1";
    process.env.E2E_FIXTURE_ROOT = root;
    expect(assertE2EFixtureRoot()).toBe(path.resolve(root));
  });
});
