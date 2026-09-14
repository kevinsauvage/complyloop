import { afterEach, describe, expect, it, vi } from "vitest";

import {
  aiGatewayApiKey,
  appUrl,
  assessmentCheckoutQuota,
  e2eAuthEnabled,
  githubApiBaseUrl,
  githubAppId,
  nodeEnv,
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
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    expect(githubApiBaseUrl()).toBeUndefined();
    expect(aiGatewayApiKey()).toBeUndefined();
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

  it("reads support email, app URL fallbacks, and node env", () => {
    vi.stubEnv("COMPLYLOOP_SUPPORT_EMAIL", "  support@example.com  ");
    expect(supportEmail()).toBe("support@example.com");
    vi.stubEnv("COMPLYLOOP_SUPPORT_EMAIL", "");
    expect(supportEmail()).toBeNull();

    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    vi.stubEnv("AUTH_URL", "https://auth.example.com");
    expect(appUrl()).toBe("https://app.example.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(appUrl()).toBe("https://auth.example.com");
    vi.stubEnv("AUTH_URL", "");
    expect(appUrl()).toBeUndefined();

    expect(nodeEnv()).toBe("test");
  });
});
