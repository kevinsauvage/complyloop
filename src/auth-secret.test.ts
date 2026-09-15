import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveAuthSecret,
  sessionCookieIsSecure,
} from "./auth-secret";

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

  it.each([
    "replace-me",
    "e2e-secret-change-me",
    "dev-only-auth-secret-not-for-production",
  ])(
    "throws in production runtime when AUTH_SECRET is the placeholder %s",
    (placeholder) => {
      vi.stubEnv("AUTH_SECRET", placeholder);
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PHASE", "");
      expect(() => resolveAuthSecret()).toThrow(/placeholder/);
    },
  );

  it("allows the Playwright e2e secret in production runtime", () => {
    vi.stubEnv("AUTH_SECRET", "e2e-secret");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    expect(resolveAuthSecret()).toBe("e2e-secret");
  });

  it("allows a placeholder AUTH_SECRET outside production", () => {
    vi.stubEnv("AUTH_SECRET", "replace-me");
    vi.stubEnv("NODE_ENV", "development");
    expect(resolveAuthSecret()).toBe("replace-me");
  });

  it("allows the build phase without AUTH_SECRET so next build can run", () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(resolveAuthSecret()).toBe("dev-only-auth-secret-not-for-production");
  });
});

describe("sessionCookieIsSecure", () => {
  it("is true when AUTH_URL is https (ngrok-style https dev origin)", () => {
    vi.stubEnv("AUTH_URL", "https://example.ngrok-free.dev");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("X_FORWARDED_PROTO", "");
    expect(sessionCookieIsSecure()).toBe(true);
  });

  it("is false when AUTH_URL is http", () => {
    vi.stubEnv("AUTH_URL", "http://localhost:3000");
    vi.stubEnv("X_FORWARDED_PROTO", "");
    expect(sessionCookieIsSecure()).toBe(false);
  });

  it("falls back to X_FORWARDED_PROTO when AUTH_URL is unset", () => {
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("X_FORWARDED_PROTO", "https,http");
    expect(sessionCookieIsSecure()).toBe(true);
  });

  it("is false without AUTH_URL or forwarded proto (plain localhost dev)", () => {
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("X_FORWARDED_PROTO", "");
    expect(sessionCookieIsSecure()).toBe(false);
  });
});
