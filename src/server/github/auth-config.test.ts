import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertProductionGitHubAuth,
  isGitHubAuthConfigured,
} from "./auth-config";
import { assertProductionGitHubApp } from "./github-app";

vi.mock("./github-app", () => ({
  assertProductionGitHubApp: vi.fn(),
}));

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "a-secret");
  vi.stubEnv("AUTH_GITHUB_ID", "client-id");
  vi.stubEnv("AUTH_GITHUB_SECRET", "client-secret");
  vi.stubEnv("AUTH_URL", "https://app.example");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PHASE", "phase-production-server");
  vi.mocked(assertProductionGitHubApp).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isGitHubAuthConfigured", () => {
  it("is true when all three credentials are set", () => {
    expect(isGitHubAuthConfigured()).toBe(true);
  });

  it.each(["AUTH_SECRET", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"])(
    "is false without %s",
    (key) => {
      vi.stubEnv(key, "");
      expect(isGitHubAuthConfigured()).toBe(false);
    },
  );
});

describe("assertProductionGitHubAuth", () => {
  it("requires AUTH_URL when production has GitHub sign-in", () => {
    vi.stubEnv("AUTH_URL", "");
    expect(() => assertProductionGitHubAuth()).toThrow(/AUTH_URL is required/);
    expect(assertProductionGitHubApp).not.toHaveBeenCalled();
  });

  it("delegates the App check once the public URL is set", () => {
    assertProductionGitHubAuth();
    expect(assertProductionGitHubApp).toHaveBeenCalledOnce();
  });

  it("does nothing when GitHub sign-in is not configured", () => {
    vi.stubEnv("AUTH_GITHUB_SECRET", "");
    vi.stubEnv("AUTH_URL", "");
    expect(() => assertProductionGitHubAuth()).not.toThrow();
    expect(assertProductionGitHubApp).not.toHaveBeenCalled();
  });

  it("does nothing outside production", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AUTH_URL", "");
    expect(() => assertProductionGitHubAuth()).not.toThrow();
    expect(assertProductionGitHubApp).not.toHaveBeenCalled();
  });

  it("skips the Next production build phase", () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("AUTH_URL", "");
    expect(() => assertProductionGitHubAuth()).not.toThrow();
    expect(assertProductionGitHubApp).not.toHaveBeenCalled();
  });
});
