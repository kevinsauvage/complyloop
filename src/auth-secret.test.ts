import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAuthSecret } from "./auth-secret";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveAuthSecret", () => {
  it("returns AUTH_SECRET when set", () => {
    vi.stubEnv("AUTH_SECRET", "prod-secret-value");
    vi.stubEnv("NODE_ENV", "production");
    expect(resolveAuthSecret()).toBe("prod-secret-value");
  });

  it("uses the dev-only fallback outside production", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveAuthSecret()).toBe("dev-only-auth-secret-not-for-production");
  });

  it("throws in production runtime when AUTH_SECRET is missing", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    expect(() => resolveAuthSecret()).toThrow(/AUTH_SECRET is required/);
  });

  it("allows the build phase without AUTH_SECRET so next build can run", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(resolveAuthSecret()).toBe("dev-only-auth-secret-not-for-production");
  });
});
