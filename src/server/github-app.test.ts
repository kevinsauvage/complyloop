import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertProductionGitHubApp,
  githubAuthorizationScopes,
  isGitHubAppConfigured,
  normalizeGitHubAppPrivateKey,
} from "./github-app";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GitHub App configuration", () => {
  it("detects when App credentials are present", () => {
    vi.stubEnv("GITHUB_APP_ID", "12345");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----");
    expect(isGitHubAppConfigured()).toBe(true);
    expect(githubAuthorizationScopes()).toBe("read:user user:email");
  });

  it("falls back to classic repo scope without App credentials", () => {
    vi.stubEnv("GITHUB_APP_ID", "");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "");
    expect(isGitHubAppConfigured()).toBe(false);
    expect(githubAuthorizationScopes()).toBe("read:user user:email repo");
  });

  it("normalizes escaped newlines in private keys", () => {
    expect(normalizeGitHubAppPrivateKey("line1\\nline2")).toBe("line1\nline2");
  });

  it("requires App credentials in production when GitHub auth is configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("AUTH_SECRET", "secret");
    vi.stubEnv("AUTH_GITHUB_ID", "client");
    vi.stubEnv("AUTH_GITHUB_SECRET", "client-secret");
    vi.stubEnv("GITHUB_APP_ID", "");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "");
    expect(() => assertProductionGitHubApp()).toThrow(/GITHUB_APP_ID/);
  });

  it("allows production when App credentials are set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("AUTH_SECRET", "secret");
    vi.stubEnv("AUTH_GITHUB_ID", "client");
    vi.stubEnv("AUTH_GITHUB_SECRET", "client-secret");
    vi.stubEnv("GITHUB_APP_ID", "99");
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "key");
    expect(() => assertProductionGitHubApp()).not.toThrow();
  });
});
