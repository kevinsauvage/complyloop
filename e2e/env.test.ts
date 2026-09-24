import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { E2E_DEFAULT_DATABASE_URL, resolveE2EDatabaseUrl } from "./env";

const KEYS = [
  "E2E_DATABASE_URL",
  "DATABASE_URL",
  "E2E_ALLOW_DATABASE_URL",
] as const;

function setEnv(values: Partial<Record<(typeof KEYS)[number], string>>): void {
  for (const key of KEYS) vi.stubEnv(key, values[key] ?? "");
}

beforeEach(() => setEnv({}));
afterEach(() => vi.unstubAllEnvs());

describe("resolveE2EDatabaseUrl", () => {
  it("prefers an explicit E2E_DATABASE_URL", () => {
    setEnv({
      E2E_DATABASE_URL: "postgres://e2e/db",
      DATABASE_URL: "postgres://prod/db",
    });
    expect(resolveE2EDatabaseUrl()).toBe("postgres://e2e/db");
  });

  it("never falls back to DATABASE_URL", () => {
    setEnv({ DATABASE_URL: "postgres://prod/db" });
    expect(resolveE2EDatabaseUrl()).toBe(E2E_DEFAULT_DATABASE_URL);
  });

  it("uses DATABASE_URL only behind the explicit opt-in", () => {
    setEnv({ DATABASE_URL: "postgres://ci/db", E2E_ALLOW_DATABASE_URL: "1" });
    expect(resolveE2EDatabaseUrl()).toBe("postgres://ci/db");
  });

  it("ignores blank values", () => {
    setEnv({ E2E_DATABASE_URL: "   ", DATABASE_URL: "postgres://prod/db" });
    expect(resolveE2EDatabaseUrl()).toBe(E2E_DEFAULT_DATABASE_URL);
  });
});
