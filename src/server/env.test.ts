import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assessmentCheckoutQuota,
  e2eAuthEnabled,
  githubApiBaseUrl,
  githubAppId,
  supportEmail,
} from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server env", () => {
  it("reads lazily so stubbed values apply at call time", () => {
    vi.stubEnv("GITHUB_APP_ID", "");
    expect(githubAppId()).toBeUndefined();

    vi.stubEnv("GITHUB_APP_ID", "123");
    expect(githubAppId()).toBe("123");
  });

  it("returns undefined for unset optionals", () => {
    vi.stubEnv("GITHUB_API_BASE_URL", "");
    expect(githubApiBaseUrl()).toBeUndefined();
    expect(e2eAuthEnabled()).toBe(false);
  });

  it("falls back to quota defaults on missing/invalid values", () => {
    vi.stubEnv("ASSESSMENT_MAX_CHECKOUT_BYTES", "");
    vi.stubEnv("ASSESSMENT_MAX_CHECKOUT_FILES", "nope");
    const quota = assessmentCheckoutQuota();
    expect(quota.maxBytes).toBe(500 * 1024 * 1024);
    expect(quota.maxFiles).toBe(50_000);
    expect(quota.scanTimeoutMs).toBe(30_000);
  });

  it("reads the support email", () => {
    vi.stubEnv("COMPLYLOOP_SUPPORT_EMAIL", "  support@example.com  ");
    expect(supportEmail()).toBe("support@example.com");
    vi.stubEnv("COMPLYLOOP_SUPPORT_EMAIL", "");
    expect(supportEmail()).toBeNull();
  });
});
